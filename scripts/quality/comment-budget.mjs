#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot as root } from '../lib/helpers.mjs'

const ts = createRequire(new URL('../../packages/cli/package.json', import.meta.url))('typescript')

function rustComments(text) {
  const ranges = []
  let i = 0
  while (i < text.length) {
    const raw = /^(?:br|cr|r)(#{0,255})"/.exec(text.slice(i))
    if (raw && (i === 0 || !/[\w]/.test(text[i - 1]))) {
      const close = '"' + raw[1]
      const end = text.indexOf(close, i + raw[0].length)
      i = end < 0 ? text.length : end + close.length
    } else if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i + 2)
      ranges.push({ pos: i, end: end < 0 ? text.length : end })
      i = end < 0 ? text.length : end
    } else if (text.startsWith('/*', i)) {
      const start = i
      let depth = 1
      i += 2
      while (i < text.length && depth) {
        if (text.startsWith('/*', i)) {
          depth++
          i += 2
        } else if (text.startsWith('*/', i)) {
          depth--
          i += 2
        } else i++
      }
      ranges.push({ pos: start, end: i })
    } else if (text[i] === '"') {
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') i++
        i++
      }
      if (i < text.length) i++
    } else if (text[i] === "'") {
      // A lifetime has no closing quote; only skip a complete character literal.
      const character = /^'(?:\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F_]+\}|[^\r\n])|[^'\\\r\n])'/.exec(
        text.slice(i),
      )
      i += character ? character[0].length : 1
    } else i++
  }
  return ranges
}

function jsComments(text, source) {
  const comments = new Map()
  function collect(node) {
    for (const pos of [node.getFullStart(), node.end]) {
      for (const range of [
        ...(ts.getLeadingCommentRanges(text, pos) ?? []),
        ...(ts.getTrailingCommentRanges(text, pos) ?? []),
      ])
        comments.set(range.pos, range)
    }
    ts.forEachChild(node, collect)
  }
  collect(source)
  return [...comments.values()].sort((a, b) => a.pos - b.pos)
}

/** Analyze JS, TS or Rust source and return comment budget warnings with line numbers. */
export function analyzeComments(text, filename = 'source.tsx') {
  const kind = filename.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : filename.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : /\.[cm]?js$/.test(filename)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, kind)
  const commentLines = new Set(),
    codeLines = new Set()
  const blocks = filename.endsWith('.rs') ? rustComments(text) : jsComments(text, source)
  const warnings = []
  let previousLine = -2,
    lineRun = 0
  for (const [index, block] of blocks.entries()) {
    const start = source.getLineAndCharacterOfPosition(block.pos).line
    const end = source.getLineAndCharacterOfPosition(block.end - 1).line
    for (let i = start; i <= end; i++) commentLines.add(i)
    const content = text.slice(block.pos, block.end)
    if (content.startsWith('//')) {
      lineRun = start === previousLine + 1 ? lineRun + 1 : 1
      if (lineRun === 7) {
        let last = index
        while (
          last + 1 < blocks.length &&
          /^\s*\r?\n\s*$/.test(text.slice(blocks[last].end, blocks[last + 1].pos)) &&
          text.startsWith('//', blocks[last + 1].pos)
        )
          last++
        const group = text.slice(blocks[index - 6].pos, blocks[last].end)
        const docExample = /^(?:\/\/\/|\/\/!)/.test(group) && /```/.test(group)
        if (!docExample)
          warnings.push({
            rule: 'block',
            line: start - 5,
            message: 'comment block exceeds 6 lines',
          })
      }
      previousLine = end
    } else {
      lineRun = 0
      previousLine = -2
    }
    if (
      end - start + 1 > 6 &&
      !(/^\/\*(?:\*|!)/.test(content) && /(?:@example\b|```)/.test(content))
    )
      warnings.push({ rule: 'block', line: start + 1, message: 'comment block exceeds 6 lines' })
    if (/\b(?:sprint\s*\d+|research(?:ed|ing)?|20\d\d[-/]\d{1,2}[-/]\d{1,2})\b/i.test(content))
      warnings.push({
        rule: 'narration',
        line: start + 1,
        message: 'sprint, research or date narration',
      })
  }
  const chars = text.split('')
  for (const { pos, end } of blocks)
    for (let i = pos; i < end; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '
  chars
    .join('')
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (line.trim()) codeLines.add(i)
    })
  if (commentLines.size > codeLines.size * 0.15)
    warnings.push({
      rule: 'ratio',
      line: 1,
      message: `${commentLines.size} comment lines / ${codeLines.size} code lines exceeds 15%`,
    })
  return { commentLines: commentLines.size, codeLines: codeLines.size, warnings }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((path) => /(?:^|\/)src\/.*\.(?:[cm]?[jt]sx?|rs)$/.test(path))
  const files = tracked
  let offenders = 0
  for (const path of files) {
    const result = analyzeComments(readFileSync(join(root, path), 'utf8'), path)
    if (!result.warnings.length) continue
    offenders++
    for (const warning of result.warnings)
      console.log(`${path}:${warning.line}: ${warning.message}`)
  }
  console.log(`Tracked coverage: ${files.length}/${tracked.length} src files (JS/TS/Rust)`)
  console.log(`Comment budget: ${offenders} files with warnings`)
}
