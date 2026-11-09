#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)
function loadTypescript() {
  try { return require('typescript') } catch { /* Try the shared workspace install. */ }
  const stores = [join(root, 'node_modules/.pnpm'), resolve(root, '../../weft/node_modules/.pnpm')]
  for (const store of stores) {
    if (!existsSync(store)) continue
    for (const name of readdirSync(store).filter((name) => name.startsWith('typescript@')).sort()) {
      const path = join(store, name, 'node_modules/typescript/lib/typescript.js')
      if (existsSync(path)) return require(path)
    }
  }
  throw new Error('TypeScript is required to analyze comments; install workspace dependencies')
}
const ts = loadTypescript()

/** Analyze JS or TS source and return comment budget warnings with line numbers. */
export function analyzeComments(text, filename = 'source.tsx') {
  const kind = /\.tsx$/.test(filename) ? ts.ScriptKind.TSX : /\.jsx$/.test(filename)
    ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(filename) ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, kind)
  const comments = new Map()
  function collect(node) {
    for (const pos of [node.getFullStart(), node.end]) {
      for (const range of [...(ts.getLeadingCommentRanges(text, pos) ?? []),
        ...(ts.getTrailingCommentRanges(text, pos) ?? [])]) comments.set(range.pos, range)
    }
    ts.forEachChild(node, collect)
  }
  collect(source)
  const lines = text.split(/\r?\n/), commentLines = new Set(), codeLines = new Set()
  const blocks = [...comments.values()].sort((a, b) => a.pos - b.pos)
  const warnings = []
  let previousLine = -2, lineRun = 0
  for (const block of blocks) {
    const start = source.getLineAndCharacterOfPosition(block.pos).line
    const end = source.getLineAndCharacterOfPosition(block.end - 1).line
    for (let i = start; i <= end; i++) commentLines.add(i)
    const content = text.slice(block.pos, block.end)
    if (content.startsWith('//')) {
      lineRun = start === previousLine + 1 ? lineRun + 1 : 1
      if (lineRun === 7) warnings.push({ rule: 'block', line: start - 5, message: 'comment block exceeds 6 lines' })
      previousLine = end
    } else {
      lineRun = 0
      previousLine = -2
    }
    if (end - start + 1 > 6 && !(/^\/\*\*/.test(content) && /@example\b/.test(content)))
      warnings.push({ rule: 'block', line: start + 1, message: 'comment block exceeds 6 lines' })
    if (/\b(?:sprint\s*\d+|research(?:ed|ing)?|20\d\d[-/]\d{1,2}[-/]\d{1,2})\b/i.test(content))
      warnings.push({ rule: 'narration', line: start + 1, message: 'sprint, research or date narration' })
  }
  const chars = text.split('')
  for (const { pos, end } of blocks) for (let i = pos; i < end; i++)
    if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '
  chars.join('').split(/\r?\n/).forEach((line, i) => { if (line.trim()) codeLines.add(i) })
  if (commentLines.size > codeLines.size * 0.15)
    warnings.push({ rule: 'ratio', line: 1, message: `${commentLines.size} comment lines / ${codeLines.size} code lines exceeds 15%` })
  return { commentLines: commentLines.size, codeLines: codeLines.size, warnings }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0')
    .filter((path) => /(?:^|\/)src\/.*\.(?:[cm]?[jt]sx?|rs)$/.test(path))
  const files = tracked.filter((path) => !path.endsWith('.rs'))
  let offenders = 0
  for (const path of files) {
    const result = analyzeComments(readFileSync(join(root, path), 'utf8'), path)
    if (!result.warnings.length) continue
    offenders++
    for (const warning of result.warnings) console.log(`${path}:${warning.line}: ${warning.message}`)
  }
  console.log(`Tracked coverage: ${files.length}/${tracked.length} src files (JS/TS); ${tracked.length - files.length} Rust files not analyzed`)
  console.log(`Comment budget: ${offenders} files with warnings`)
}
