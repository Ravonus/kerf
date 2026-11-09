#!/usr/bin/env node
// Inventory repeated source windows without changing the exit status for findings.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repoRoot } from '../lib/helpers.mjs'

const source = /\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts|rs)$/

// Scan literals as units so comment markers inside them remain significant.
function tokenize(text, rust) {
  const lines = [[]]
  let i = 0
  let previous = ''
  function add(value) {
    const parts = value.split('\n')
    for (let n = 0; n < parts.length; n++) {
      if (n) lines.push([])
      if (parts[n]) lines.at(-1).push(parts[n])
    }
  }
  function quoted(quote) {
    const start = i++
    while (i < text.length) {
      if (text[i] === '\\') i += 2
      else if (text[i++] === quote) break
    }
    return text.slice(start, i)
  }
  function template() {
    const start = i++
    while (i < text.length) {
      if (text[i] === '\\') i += 2
      else if (text[i] === '`') { i++; break }
      else if (text[i] === '$' && text[i + 1] === '{') {
        i += 2
        let depth = 1
        while (i < text.length && depth) {
          if (text[i] === '"' || text[i] === "'") quoted(text[i])
          else if (text[i] === '`') template()
          else if (text.startsWith('//', i)) {
            i = text.indexOf('\n', i)
            if (i < 0) i = text.length
          } else if (text.startsWith('/*', i)) blockComment(false)
          else if (text[i] === '{') { depth++; i++ }
          else if (text[i] === '}') { depth--; i++ }
          else i++
        }
      } else i++
    }
    return text.slice(start, i)
  }
  function blockComment(countLines = true) {
    i += 2
    let depth = 1
    while (i < text.length && depth) {
      if (rust && text.startsWith('/*', i)) { depth++; i += 2 }
      else if (text.startsWith('*/', i)) { depth--; i += 2 }
      else { if (countLines && text[i] === '\n') lines.push([]); i++ }
    }
  }
  while (i < text.length) {
    if (text[i] === '\n') { lines.push([]); i++; continue }
    if (/\s/.test(text[i])) { i++; continue }
    if (text.startsWith('//', i)) {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (text.startsWith('/*', i)) { blockComment(); continue }
    const raw = rust && text.slice(i).match(/^(?:br|r)(#*)"/)
    let token
    if (raw) {
      const start = i
      i += raw[0].length
      const end = text.indexOf('"' + raw[1], i)
      i = end < 0 ? text.length : end + 1 + raw[1].length
      token = text.slice(start, i)
    } else if (text[i] === '"' || text[i] === "'") token = quoted(text[i])
    else if (!rust && text[i] === '`') token = template()
    else if (!rust && text[i] === '/' && (!previous || /^(?:[({[=,:;!?&|+*%~<>-]|return|throw|case|yield|await)$/.test(previous))) {
      const start = i++
      let inClass = false
      while (i < text.length && text[i] !== '\n') {
        if (text[i] === '\\') i += 2
        else if (text[i] === '[') { inClass = true; i++ }
        else if (text[i] === ']') { inClass = false; i++ }
        else if (text[i++] === '/' && !inClass) break
      }
      while (/[a-z]/i.test(text[i] ?? '') && i < text.length) i++
      token = text.slice(start, i)
    } else {
      const match = text.slice(i).match(/^[\w$]+/)
      token = match ? match[0] : text[i]
      i += token.length
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
    const populated = lines.flatMap((line, i) => line.length ? [{ line: i + 1, value: JSON.stringify(line) }] : [])
    for (let i = 0; i + 12 <= populated.length; i++) {
      const key = populated.slice(i, i + 12).map((line) => line.value).join('\n')
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
    .split('\0').filter((path) => source.test(path))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const paths = tracked()
  const groups = duplicates(paths.map((path) => [path, readFileSync(resolve(repoRoot, path), 'utf8')]))
  console.log(`Checked ${paths.length} tracked source and test files (git ls-files).`)
  for (const group of groups) console.log(`Warning: ${group.map(({ path, line, end }) => `${path}:${line}-${end}`).join(' = ')}`)
  console.log(`${groups.length} repeated windows (warnings only).`)
}
