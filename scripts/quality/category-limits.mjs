#!/usr/bin/env node
// Inventory category limits without changing the enforced length baseline.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repoRoot } from '../lib/helpers.mjs'
import { categories, classify } from './categories.mjs'
import { lineCount } from './length-metrics.mjs'
import { rustFindings } from './length-rust.mjs'

const ts = createRequire(new URL('../../packages/cli/package.json', import.meta.url))('typescript')
const source = /\.(?:[cm]?[jt]sx?|rs|css)$/

/** Report limits for a single path and its source. */
export function measure(path, text) {
  const category = classify(path, { content: text })
  if (!category) return { category: null, findings: [], parseErrors: 0 }
  const findings = []
  const check = (kind, count, limit, line = 1) => {
    if (limit !== null && count > limit)
      findings.push({ path, category: category.name, kind, count, limit, line })
  }
  check('file', lineCount(text), category.file)
  if (path.endsWith('.rs')) {
    for (const item of rustFindings(path, text, { allFunctions: true })) {
      if (item.kind !== 'function') continue
      check('function', item.count, category.function, item.start)
      check('params', item.params, category.params, item.start)
    }
    return { category: category.name, findings, parseErrors: 0 }
  }
  if (!/\.[cm]?[jt]sx?$/.test(path)) return { category: category.name, findings, parseErrors: 0 }
  const kind = path.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : path.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : /\.[cm]?js$/.test(path)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS
  const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  function visit(node) {
    if (ts.isFunctionLike(node) && node.body) {
      const start = node.getStart(tree)
      const line = tree.getLineAndCharacterOfPosition(start).line + 1
      check('function', lineCount(text.slice(start, node.end)), category.function, line)
      check('params', node.parameters.length, category.params, line)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return { category: category.name, findings, parseErrors: tree.parseDiagnostics.length }
}

/** Generate non-overlapping file-specific Oxlint overrides from the category table. */
export function overrides(files) {
  return categories.flatMap((category) => {
    const paths = files
      .filter(({ path, content = '' }) => classify(path, { content })?.name === category.name)
      .map(({ path }) =>
        path.replace(/\[|\*|\?/g, (char) => ({ '[': '[[]', '*': '[*]', '?': '[?]' })[char]),
      )
      .sort()
    if (!paths.length) return []
    const rules = { 'max-lines': ['warn', { max: category.file, skipBlankLines: false }] }
    if (category.function !== null)
      rules['max-lines-per-function'] = [
        'warn',
        { max: category.function, skipBlankLines: false, IIFEs: true },
      ]
    if (category.params !== null) rules['max-params'] = ['warn', { max: category.params }]
    return [{ files: paths, rules }]
  })
}

/** Compare stored overrides with the generated result. */
export function overrideDrift(actual, files) {
  return JSON.stringify(actual) !== JSON.stringify(overrides(files))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
  const files = tracked.filter((path) => source.test(path))
  let classified = 0,
    parseErrors = 0
  const unclassified = []
  for (const path of files) {
    const result = measure(path, readFileSync(resolve(repoRoot, path), 'utf8'))
    if (!result.category) unclassified.push(path)
    else classified++
    parseErrors += result.parseErrors
    if (result.parseErrors) console.log(`${path}: ${result.parseErrors} parser diagnostic(s)`)
    for (const item of result.findings)
      console.log(
        `${item.path}:${item.line}: ${item.category} ${item.kind} ${item.count} > ${item.limit}`,
      )
  }
  for (const path of unclassified) console.log(`${path}: unclassified`)
  console.log(
    `Tracked files: ${tracked.length}; candidate source files: ${files.length}; classified: ${classified}; unclassified: ${unclassified.length}; parser diagnostics: ${parseErrors}`,
  )
}
