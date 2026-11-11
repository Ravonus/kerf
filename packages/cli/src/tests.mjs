// Static T-codes for test files (PLAN §7b, research 05 §5.1): tests that can't be junk.
//
//   T001 no assertion          T004 sleeps / real timers     T007 unapproved snapshot
//   T002 tautology             T005 implementation queries   T008 conditional or looped `expect`
//   T003 asserts what it set   T006 mocks kerf or the unit   T009 `.only` / `.skip`
//   T013 a real socket
//
// Syntax only (TypeScript's parser, no type checker), like the project view. `@kerf-js/core/test` adds a runtime T001 for
// assertions this pass can't see. A finding a test needs on purpose is kept with a written reason:
//
//   // kerf-allow T004, T005: hydration tests read the server DOM and wait for real timers
//
// in the file's leading comments covers the whole file; anywhere else it covers its own line and the next one.
// Without a reason it is ignored.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { diagnostic, positions } from './diag.mjs'
import { parse, testCall, walk } from './test-rules/syntax.mjs'
import { contextOf } from './test-rules/context.mjs'
import { runTestRules } from './test-rules/test-rules.mjs'
import { fileRules, renderResultsOf } from './test-rules/file-rules.mjs'

export { isSubject, matcherOf, norm, parse, resolveImport, testCall } from './test-rules/syntax.mjs'

export const testGlobs = ['**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}']

/** Comment directives: `// kerf-allow T004, T005: reason`. */
export function allowances(text, sf) {
  const firstCode = sf.statements[0]?.getStart(sf) ?? text.length
  const file = new Set()
  const lines = new Map()
  const pos = positions(text)
  for (const m of text.matchAll(
    /\/\/[ \t]*kerf-allow[ \t]+((?:T\d{3}[ \t,]*)+)(?::[ \t]*(\S.*))?$/gm,
  )) {
    if (!m[2]?.trim()) continue
    const codes = m[1].match(/T\d{3}/g)
    if (m.index < firstCode) for (const c of codes) file.add(c)
    else {
      const [line] = pos.lineCol(m.index)
      for (const l of [line, line + 1]) for (const c of codes) lines.set(`${c}:${l}`, true)
    }
  }
  return (code, line) => file.has(code) || lines.has(`${code}:${line}`)
}

/**
 * T-codes for one test file.
 * @param {string} text
 * @param {string} rel path relative to the project root (for diagnostics)
 * @param {{ abs?: string, root?: string }} [options] `abs` lets T001/T006 read the helpers and units the file imports
 */
export function checkTestFile(text, rel, options = {}) {
  const abs = options.abs ?? rel
  const sf = parse(text, rel)
  const pos = positions(text)
  const allowed = allowances(text, sf)
  const out = []
  const seen = new Set()
  const report = (code, node, why, extra = {}) => {
    const start = node.getStart(sf)
    const end = node.getEnd()
    const span = pos.span(start, end)
    const key = `${code}:${span[0]}:${span[1]}`
    if (allowed(code, span[0]) || seen.has(key)) return
    seen.add(key)
    out.push(diagnostic({ code, file: rel, span, offset: [start, end], why, ...extra }))
  }
  const edit = (start, end, newText) => ({
    file: rel,
    span: pos.span(start, end),
    offset: [start, end],
    text: newText,
  })
  const context = { ...contextOf(sf, abs), sf, edit, report }
  const tests = []
  walk(sf, (n) => {
    if (!ts.isCallExpression(n)) return
    const t = testCall(n)
    if (t) tests.push(t)
  })
  for (const t of tests) runTestRules(t, context)
  context.renderResults = renderResultsOf(sf, report)
  walk(sf, (n) => {
    for (const rule of fileRules) rule(n, context)
  })
  return out
}

/**
 * T-codes for the project's test files.
 * @param {string} root absolute project root
 * @param {string[]} rels test files, relative to `root`
 */
export function checkTests(root, rels) {
  return rels.flatMap((rel) => {
    const abs = join(root, rel)
    return checkTestFile(readFileSync(abs, 'utf8'), rel, { abs })
  })
}

export const isTestFile = (rel) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)

/** Which T-codes this pass reports: each catalog example must produce its own code (the T side of `probe()`). */
export function probeTests(catalog) {
  const out = {}
  for (const e of catalog) {
    if (!/^T\d{3}$/.test(e.code) || e.by !== 'cli') continue // T012 is @kerf-js/core/test's runtime check
    const hit =
      e.example && checkTestFile(e.example, 'probe.test.tsx').find((d) => d.code === e.code)
    out[e.code] = {
      implemented: Boolean(hit),
      autofix: hit?.fix?.safe === true,
      suggestion: Boolean(hit?.fix?.edits) && hit.fix.safe !== true,
    }
  }
  return out
}
