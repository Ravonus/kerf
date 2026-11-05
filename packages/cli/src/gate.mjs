// `weft test --gate`: a new or changed test has to prove it tests something (PLAN §7b, research 05 §5.1, research 22).
//
//   1. Fail-before (T010): each new or changed test fails against the code before the change, and passes after it.
//   2. Mutation on changed lines (T011): each new test kills at least one mutant of the changed source lines.
//      Surviving mutants come back with what an assertion that kills them would check.
//   3. No silent weakening (T020): an existing test deleted, skipped or loosened needs `// weft-allow T020: <reason>`.
//   Plus the static T-codes on the changed test files, with T005 (implementation queries) blocking for new tests.
//
// Tests run in scratch copies of the project (`.weft/gate/`), never in the working tree. With no source change
// (tests added for existing code) there is no "before" to fail on: fail-before is skipped and the mutants come from
// the source files the new tests import.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join, resolve } from 'node:path'
import { diagnostic } from './diag.mjs'
import { runGate } from './gate/run.mjs'
import { classify } from './gate/classify.mjs'
import { makeResult } from './gate/result.mjs'
import { loadConfig } from './load-config.mjs'
import { testCases } from './testdiff.mjs'
import { resolveImport } from './tests.mjs'

const code = (rel) => /\.[cm]?[jt]sx?$/.test(rel) && !/\.d\.[cm]?ts$/.test(rel)
const configFile = (rel) =>
  /(^|\/)(vite|vitest|weft|tsup|eslint|playwright)\.config\.[cm]?[jt]s$/.test(rel)
const posix = (p) => p.split('\\').join('/')

/** Changed files between `base` and the working tree, from git (paths relative to `root`). */
export function gitChanges(root, base = 'HEAD') {
  const git = (...args) =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  const list = [
    ...git('diff', '--name-only', '--relative', '--no-renames', base).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  ]
  const rels = [...new Set(list.filter((r) => r && !r.startsWith('.weft/')))]
  return rels
    .map((rel) => {
      let before = null
      try {
        before = git('show', `${base}:./${rel}`)
      } catch {}
      const abs = join(root, rel)
      return { rel, before, after: existsSync(abs) ? readFileSync(abs, 'utf8') : null }
    })
    .filter((c) => c.before !== c.after)
}

const importRe = /(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g
const typeOnly = /^\s*(?:import|export)\s+type\b[^;'"]*from\s*['"][^'"]+['"];?/gm
/** Runtime imports only: `import type` brings no code a test could run. */
function importsOf(abs, text) {
  const out = []
  for (const m of text.replace(typeOnly, '').matchAll(importRe)) {
    const p = resolveImport(abs, m[1])
    if (p) out.push(p)
  }
  return out
}

/**
 * @param {string} root project root (the "after" state)
 * @param {{
 *   base?: string, changes?: { rel: string, before: string | null, after: string | null }[],
 *   budgetSec?: number, maxMutants?: number, concurrency?: number, refactor?: boolean, mutation?: boolean,
 *   exclude?: (rel: string) => boolean, config?: string, log?: (line: string) => void,
 * }} [options] `changes` replaces the git diff (the eval harness passes its own); `exclude` leaves paths out of the copies
 */
export async function gate(root, options = {}) {
  const started = performance.now()
  root = resolve(root)
  const log = options.log ?? (() => {})
  const { config } = await loadConfig(root).catch(() => ({ config: {} }))
  const gateCfg = config.test?.gate ?? {}
  const budgetSec = options.budgetSec ?? gateCfg.mutationBudgetSec ?? 60
  const maxMutants = options.maxMutants ?? gateCfg.maxMutants ?? 40
  const concurrency = Math.max(
    1,
    options.concurrency ?? Math.min(4, Math.floor(availableParallelism() / 3) || 1),
  )
  const changes = (options.changes ?? gitChanges(root, options.base ?? 'HEAD')).map((c) => ({
    ...c,
    rel: posix(c.rel),
  }))

  const { tests, support, source, isSupport, diagnostics, allowed, cases, testFiles } = classify(
    root,
    changes,
    code,
    configFile,
    importsOf,
  )
  const { result, finish } = makeResult({
    root,
    options,
    tests,
    support,
    source,
    diagnostics,
    budgetSec,
    started,
  })

  if (options.refactor) {
    if (cases.length)
      for (const c of cases)
        diagnostics.push(
          diagnostic({
            code: 'T020',
            file: c.file,
            span: [c.line, 1, c.line, 1],
            why: `--refactor promises behavior didn't change, but test "${c.name}" is new or edited`,
            help: 'Drop --refactor, or leave the tests alone',
          }),
        )
    if (!cases.length) {
      result.notes.push('refactor: no test changed; run the whole suite to confirm behavior')
      return finish()
    }
  }
  if (!cases.length) {
    result.notes.push('no new or changed tests')
    return finish()
  }

  await runGate({
    root,
    options,
    cases,
    testFiles,
    log,
    result,
    source,
    allowed,
    diagnostics,
    importsOf,
    code,
    posix,
    isSupport,
    maxMutants,
    concurrency,
    budgetSec,
    started,
    compileError,
  })
  return finish()
}

/** A mutant the compiler or parser rejects never ran, so it counts as neither killed nor survived. */
const compileError = (msg) =>
  /\bW\d{3}\b|SyntaxError|Transform failed|Parse error|Unexpected token|Expected/.test(msg)

/** Human summary for stderr. */
export function formatGate(r) {
  const lines = []
  for (const t of r.tests) {
    const mark = t.accepted ? '✓' : '✗'
    lines.push(
      `${mark} ${t.file} › ${t.name}  before: ${t.before ?? '—'}, after: ${t.after}, kills: ${t.kills}${t.codes?.length ? `, ${t.codes.join(' ')}` : ''}${t.after !== 'passed' && t.afterMessage ? `\n    ${t.afterMessage}` : ''}`,
    )
  }
  const m = r.mutants
  if (m.run)
    lines.push(
      `mutants: ${m.killed}/${m.run - m.invalid} killed${m.timedOut ? ` (${m.timedOut} by timeout)` : ''}${m.invalid ? `, ${m.invalid} didn't compile` : ''}${m.sampled ? `, sampled from ${m.generated}` : ''}`,
    )
  for (const s of r.survivors.slice(0, 8)) lines.push(`  survived: ${s.suggestion}`)
  for (const n of r.notes) lines.push(`note: ${n}`)
  return lines.join('\n')
}

export { testCases }
