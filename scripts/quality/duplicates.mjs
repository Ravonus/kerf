#!/usr/bin/env node
// Inventory repeated source windows without changing the exit status for findings.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repoRoot } from '../lib/helpers.mjs'

const source = /\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts|rs)$/

/** Find repeated sequences of twelve nonempty tokenized lines. */
export function duplicates(files) {
  const windows = new Map()
  for (const [path, text] of files) {
    // Keep literal contents and newlines while discarding comments and whitespace.
    const tokens = text.match(/(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\n|[\w$]+|[^\s])/g) ?? []
    const lines = [[]]
    for (const token of tokens) {
      if (token === '\n') lines.push([])
      else if (token.startsWith('//') || token.startsWith('/*')) {
        for (const char of token) if (char === '\n') lines.push([])
      } else lines.at(-1).push(token)
    }
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
