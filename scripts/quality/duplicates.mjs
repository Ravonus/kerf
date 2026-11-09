#!/usr/bin/env node
// Inventory repeated source windows without changing the exit status for findings.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repoRoot } from '../lib/helpers.mjs'

const source = /\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts|rs)$/

function regexLiteral(text, start) {
  let i = start + 1
  let inClass = false
  while (i < text.length && text[i] !== '\n') {
    if (text[i] === '\\') i += 2
    else if (text[i] === '[') {
      inClass = true
      i++
    } else if (text[i] === ']') {
      inClass = false
      i++
    } else if (text[i++] === '/' && !inClass) break
  }
  while (/[a-z]/i.test(text[i] ?? '') && i < text.length) i++
  return { token: text.slice(start, i), end: i }
}

function quoted(state, quote) {
  const start = state.i++
  while (state.i < state.text.length) {
    if (state.text[state.i] === '\\') state.i += 2
    else if (state.text[state.i++] === quote) break
  }
  return state.text.slice(start, state.i)
}
function template(state) {
  const start = state.i++
  while (state.i < state.text.length) {
    if (state.text[state.i] === '\\') state.i += 2
    else if (state.text[state.i] === '`') {
      state.i++
      break
    } else if (state.text[state.i] === '$' && state.text[state.i + 1] === '{') {
      state.i += 2
      let depth = 1
      while (state.i < state.text.length && depth) {
        if (state.text[state.i] === '"' || state.text[state.i] === "'")
          quoted(state, state.text[state.i])
        else if (state.text[state.i] === '`') template(state)
        else if (state.text.startsWith('//', state.i)) {
          state.i = state.text.indexOf('\n', state.i)
          if (state.i < 0) state.i = state.text.length
        } else if (state.text.startsWith('/*', state.i)) blockComment(state, false)
        else if (state.text[state.i] === '{') {
          depth++
          state.i++
        } else if (state.text[state.i] === '}') {
          depth--
          state.i++
        } else state.i++
      }
    } else state.i++
  }
  return state.text.slice(start, state.i)
}
function blockComment(state, countLines = true) {
  state.i += 2
  let depth = 1
  while (state.i < state.text.length && depth) {
    if (state.rust && state.text.startsWith('/*', state.i)) {
      depth++
      state.i += 2
    } else if (state.text.startsWith('*/', state.i)) {
      depth--
      state.i += 2
    } else {
      if (countLines && state.text[state.i] === '\n') state.lines.push([])
      state.i++
    }
  }
}

// Scan literals as units so comment markers inside them remain significant.
function tokenize(text, rust) {
  const lines = [[]]
  const state = { text, rust, lines, i: 0 }
  let previous = ''
  function add(value) {
    const parts = value.split('\n')
    for (let n = 0; n < parts.length; n++) {
      if (n) lines.push([])
      if (parts[n]) lines.at(-1).push(parts[n])
    }
  }
  while (state.i < text.length) {
    if (text[state.i] === '\n') {
      lines.push([])
      state.i++
      continue
    }
    if (/\s/.test(text[state.i])) {
      state.i++
      continue
    }
    if (text.startsWith('//', state.i)) {
      while (state.i < text.length && text[state.i] !== '\n') state.i++
      continue
    }
    if (text.startsWith('/*', state.i)) {
      blockComment(state)
      continue
    }
    const raw = rust && text.slice(state.i).match(/^(?:br|r)(#*)"/)
    let token
    if (raw) {
      const start = state.i
      state.i += raw[0].length
      const end = text.indexOf('"' + raw[1], state.i)
      state.i = end < 0 ? text.length : end + 1 + raw[1].length
      token = text.slice(start, state.i)
    } else if (text[state.i] === '"' || text[state.i] === "'") token = quoted(state, text[state.i])
    else if (!rust && text[state.i] === '`') token = template(state)
    else if (
      !rust &&
      text[state.i] === '/' &&
      (!previous || /^(?:[({[=,:;!?&|+*%~<>-]|return|throw|case|yield|await)$/.test(previous))
    ) {
      const result = regexLiteral(text, state.i)
      token = result.token
      state.i = result.end
    } else {
      const match = text.slice(state.i).match(/^[\w$]+/)
      token = match ? match[0] : text[state.i]
      state.i += token.length
    }
    add(token)
    previous = token
  }
  return lines
}

/** Find repeated sequences of twelve nonempty tokenized lines. */
export function duplicates(files) {
  const windows = new Map()
  for (const [path, text] of files) {
    const lines = tokenize(text, path.endsWith('.rs'))
    const populated = lines.flatMap((line, i) =>
      line.length ? [{ line: i + 1, value: JSON.stringify(line) }] : [],
    )
    for (let i = 0; i + 12 <= populated.length; i++) {
      const key = populated
        .slice(i, i + 12)
        .map((line) => line.value)
        .join('\n')
      const list = windows.get(key) ?? []
      list.push({ path, line: populated[i].line, end: populated[i + 11].line })
      windows.set(key, list)
    }
  }
  const groups = []
  const used = new Map()
  for (const occurrences of windows.values()) {
    if (occurrences.length < 2) continue
    const selected = []
    const pending = new Map()
    for (const item of occurrences) {
      const occupied = used.get(item.path) ?? new Set()
      const local = pending.get(item.path) ?? new Set()
      const span = Array.from({ length: item.end - item.line + 1 }, (_, i) => item.line + i)
      if (span.some((line) => occupied.has(line) || local.has(line))) continue
      selected.push(item)
      for (const line of span) local.add(line)
      pending.set(item.path, local)
    }
    if (selected.length < 2) continue
    groups.push(selected)
    for (const [path, lines] of pending) {
      const occupied = used.get(path) ?? new Set()
      for (const line of lines) occupied.add(line)
      used.set(path, occupied)
    }
  }
  return groups
}

/** Read all tracked source and test files. */
export function tracked(cwd = repoRoot) {
  return execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' })
    .split('\0')
    .filter((path) => source.test(path))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const paths = tracked()
  const groups = duplicates(
    paths.map((path) => [path, readFileSync(resolve(repoRoot, path), 'utf8')]),
  )
  console.log(`Checked ${paths.length} tracked source and test files (git ls-files).`)
  for (const group of groups)
    console.log(
      `Warning: ${group.map(({ path, line, end }) => `${path}:${line}-${end}`).join(' = ')}`,
    )
  console.log(`${groups.length} repeated windows (warnings only).`)
}
