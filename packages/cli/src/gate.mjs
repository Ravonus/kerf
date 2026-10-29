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
import { join, relative, resolve } from 'node:path'
import { diagnostic, sortDiagnostics, summarize } from './diag.mjs'
import { discover } from './files.mjs'
import { loadConfig } from './load-config.mjs'
import { apply, changedLines, mutants as makeMutants, sample, suggest } from './mutate.mjs'
import { changedCases, testCases, weakened } from './testdiff.mjs'
import { allowances, checkTestFile, isTestFile, parse, resolveImport } from './tests.mjs'
import { copyProject, removeCopy, runVitest, vitestBin, writeFiles } from './workspace.mjs'

const code = rel => /\.[cm]?[jt]sx?$/.test(rel) && !/\.d\.[cm]?ts$/.test(rel)
const configFile = rel => /(^|\/)(vite|vitest|weft|tsup|eslint|playwright)\.config\.[cm]?[jt]s$/.test(rel)
const posix = p => p.split('\\').join('/')

/** Changed files between `base` and the working tree, from git (paths relative to `root`). */
export function gitChanges(root, base = 'HEAD') {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
  const list = [...git('diff', '--name-only', '--relative', '--no-renames', base).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')]
  const rels = [...new Set(list.filter(r => r && !r.startsWith('.weft/')))]
  return rels.map(rel => {
    let before = null
    try { before = git('show', `${base}:./${rel}`) } catch {}
    const abs = join(root, rel)
    return { rel, before, after: existsSync(abs) ? readFileSync(abs, 'utf8') : null }
  }).filter(c => c.before !== c.after)
}

const importRe = /(?:from\s*|import\s*\(\s*|import\s+)['"](\.[^'"]+)['"]/g
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
  const concurrency = Math.max(1, options.concurrency ?? Math.min(4, Math.floor(availableParallelism() / 3) || 1))
  const changes = (options.changes ?? gitChanges(root, options.base ?? 'HEAD')).map(c => ({ ...c, rel: posix(c.rel) }))

  // Tests, test support (helpers only tests import) and source.
  const tests = changes.filter(c => isTestFile(c.rel))
  const others = changes.filter(c => !isTestFile(c.rel) && code(c.rel) && !configFile(c.rel))
  const testAbs = new Set(discover(root, { include: ['**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'], exclude: ['.weft/**'] }).map(r => join(root, r)))
  const importedBySource = new Set()
  for (const rel of discover(root, { include: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'], exclude: ['.weft/**'] })) {
    const abs = join(root, rel)
    if (testAbs.has(abs)) continue
    for (const p of importsOf(abs, readFileSync(abs, 'utf8'))) importedBySource.add(p)
  }
  const importedByTests = new Set()
  for (const abs of testAbs) for (const p of importsOf(abs, readFileSync(abs, 'utf8'))) importedByTests.add(p)
  const isSupport = rel => importedByTests.has(join(root, rel)) && !importedBySource.has(join(root, rel)) && !rel.match(/(^|\/)src\//)
  const support = others.filter(c => isSupport(c.rel))
  const source = others.filter(c => !isSupport(c.rel))

  // Static: T020 on every changed test file, T001–T009 on the ones that still exist (T005 blocks here).
  const diagnostics = []
  for (const c of tests) diagnostics.push(...weakened(c.before, c.after, c.rel))
  for (const c of tests) {
    if (c.after == null) continue
    for (const d of checkTestFile(c.after, c.rel, { abs: join(root, c.rel), root })) {
      if (d.code === 'T005' && d.severity === 'warning') { d.severity = 'error'; d.why += ' The gate blocks implementation queries in new and changed tests.' }
      diagnostics.push(d)
    }
  }

  // The tests this change has to prove.
  // `// weft-allow T010: <reason>` / T011 on a test keeps it (shown in the result, for the reviewer).
  const allowFns = new Map(tests.filter(c => c.after != null).map(c => [c.rel, allowances(c.after, parse(c.after, c.rel))]))
  const allowed = (code, file, line) => allowFns.get(file)?.(code, line) ?? false
  const cases = tests.filter(c => c.after != null).flatMap(c => changedCases(c.before, c.after, c.rel).map(t => ({ file: c.rel, name: t.name, line: t.line, end: t.end, dynamic: t.dynamic })))
  const testFiles = [...new Set(cases.map(c => c.file))]
  const result = {
    version: 1, ok: true, root, base: options.changes ? null : (options.base ?? 'HEAD'),
    files: { tests: tests.map(c => c.rel), support: support.map(c => c.rel), source: source.map(c => c.rel) },
    tests: [], mutants: { generated: 0, run: 0, killed: 0, survived: 0, timedOut: 0, invalid: 0, sampled: false, budgetSec }, survivors: [],
    diagnostics, summary: null, notes: [], ms: 0,
  }
  const finish = () => {
    sortDiagnostics(diagnostics)
    // Each test's verdict: it ran green on the change, failed before it (when there was a before), and no error
    // diagnostic falls inside it.
    for (const t of result.tests) {
      t.codes = diagnostics.filter(d => d.severity === 'error' && d.file === t.file && d.span[0] >= t.line && d.span[0] <= t.end).map(d => d.code)
      t.accepted = t.after === 'passed' && t.before !== 'passed' && !t.codes.length
    }
    result.summary = { changedTests: result.tests.length, ...summarize(diagnostics) }
    result.ok = result.summary.errors === 0 && result.tests.every(t => t.accepted)
    result.ms = Math.round(performance.now() - started)
    return result
  }

  if (options.refactor) {
    if (cases.length) for (const c of cases) diagnostics.push(diagnostic({ code: 'T020', file: c.file, span: [c.line, 1, c.line, 1], why: `--refactor promises behavior didn't change, but test "${c.name}" is new or edited`, help: 'Drop --refactor, or leave the tests alone' }))
    if (!cases.length) { result.notes.push('refactor: no test changed; run the whole suite to confirm behavior'); return finish() }
  }
  if (!cases.length) { result.notes.push('no new or changed tests'); return finish() }

  const bin = vitestBin(root)
  const run = (dir, files) => runVitest(dir, files, { bin, config: options.config, timeoutMs: 180_000 })

  // After: the change as it stands. Every changed test must pass.
  log(`gate: ${cases.length} new or changed tests in ${testFiles.length} files; running them on the change`)
  const afterDir = copyProject(root, { exclude: options.exclude, id: 'after' })
  let after
  try { after = await run(afterDir, testFiles) } finally { removeCopy(afterDir) }
  const resolveCases = res => {
    // Static names map 1:1; results nobody claimed belong to the file's dynamic (`.each`) cases.
    const out = new Map()
    for (const f of testFiles) {
      const mine = cases.filter(c => c.file === f)
      const keys = [...res.tests.keys()].filter(k => k.startsWith(`${f}::`))
      for (const c of mine.filter(c => !c.dynamic)) out.set(`${f}::${c.name}`, res.loadErrors.has(f) ? { status: 'failed', message: res.loadErrors.get(f), load: true } : res.tests.get(`${f}::${c.name}`) ?? { status: 'missing' })
      if (mine.some(c => c.dynamic)) for (const k of keys) if (!out.has(k)) out.set(k, res.tests.get(k))
    }
    return out
  }
  const afterStatus = resolveCases(after)
  const byKey = new Map()
  for (const [key, st] of afterStatus) {
    const [file, name] = key.split('::')
    const c = cases.find(x => x.file === file && x.name === name) ?? cases.find(x => x.file === file && x.dynamic)
    const t = { file, name, line: c?.line ?? 1, end: c?.end ?? c?.line ?? 1, after: st.status, afterMessage: st.status === 'passed' ? undefined : st.message, before: null, kills: 0 }
    byKey.set(key, t)
    result.tests.push(t)
  }
  if (after.timedOut) result.notes.push('the run on the change timed out')

  // Before: source reverted, tests and their helpers as they are now. Every changed test must fail.
  if (source.length && !options.refactor) {
    log(`gate: reverting ${source.length} source files; the changed tests must fail`)
    const beforeDir = copyProject(root, { exclude: options.exclude, id: 'before' })
    let before
    try {
      writeFiles(beforeDir, Object.fromEntries(source.map(c => [c.rel, c.before])))
      before = await run(beforeDir, testFiles)
    } finally { removeCopy(beforeDir) }
    const beforeStatus = resolveCases(before)
    for (const [key, t] of byKey) {
      const st = beforeStatus.get(key) ?? (before.loadErrors.has(t.file) ? { status: 'failed', message: before.loadErrors.get(t.file) } : { status: 'missing' })
      t.before = st.status
      t.beforeMessage = st.message
      if (t.after === 'passed' && st.status === 'passed' && allowed('T010', t.file, t.line)) result.notes.push(`T010 allowed on "${t.name}"`)
      else if (t.after === 'passed' && st.status === 'passed')
        diagnostics.push(diagnostic({ code: 'T010', file: t.file, span: [t.line, 1, t.line, 1], why: `"${t.name}" passes on the code before this change too, so it doesn't test the change`, help: 'Assert what the change makes different (what the user sees now and didn\'t before); or, if this is a test for existing behavior, add it in its own change with no source edits' }))
    }
  } else if (!options.refactor) result.notes.push('no source change: fail-before skipped; mutants come from the source the new tests import')

  // Mutation: the changed source lines (or, with no source change, the source files the tests import).
  if (options.mutation !== false) {
    // Only code the changed tests can reach (runtime imports): a mutant nothing runs survives by definition.
    const reach = (limit) => {
      const seen = new Set()
      const walk = (abs, depth) => {
        if (seen.has(abs) || depth > limit || !existsSync(abs)) return
        seen.add(abs)
        for (const p of importsOf(abs, readFileSync(abs, 'utf8'))) walk(p, depth + 1)
      }
      for (const f of testFiles) walk(join(root, f), 0)
      return seen
    }
    const reachable = reach(12)
    const unreached = source.filter(c => c.after != null && code(c.rel) && !reachable.has(join(root, c.rel))).map(c => c.rel)
    if (unreached.length) result.notes.push(`not mutated (no changed test imports them): ${unreached.join(', ')}`)
    let targets = source.filter(c => c.after != null && reachable.has(join(root, c.rel))).map(c => ({ rel: c.rel, text: c.after, lines: changedLines(c.before, c.after) }))
    if (!source.length) {
      targets = [...reach(3)].map(abs => posix(relative(root, abs))).filter(rel => !isTestFile(rel) && code(rel) && !isSupport(rel) && !rel.startsWith('..') && !rel.includes('node_modules'))
        .map(rel => { const text = readFileSync(join(root, rel), 'utf8'); return { rel, text, lines: changedLines(null, text) } })
    }
    const all = targets.flatMap(t => makeMutants(t.text, t.rel, t.lines))
    const list = sample(all, maxMutants)
    result.mutants.generated = all.length
    result.mutants.sampled = list.length < all.length
    const passing = [...byKey.values()].filter(t => t.after === 'passed')
    const files = [...new Set(passing.map(t => t.file))]
    if (list.length && files.length) {
      log(`gate: ${list.length}${result.mutants.sampled ? ` of ${all.length}` : ''} mutants on ${targets.length} files, ${concurrency} at a time, ${budgetSec}s budget`)
      const texts = Object.fromEntries(targets.map(t => [t.rel, t.text]))
      const deadline = started + budgetSec * 1000 + after.ms
      const timeoutMs = Math.max(15_000, after.ms * 3)
      const queue = [...list]
      const outcomes = []
      const worker = async i => {
        const dir = copyProject(root, { exclude: options.exclude, id: `mutant-${i}` })
        try {
          for (let m; (m = queue.shift()); ) {
            if (performance.now() > deadline) { result.mutants.sampled = true; queue.length = 0; break }
            writeFiles(dir, { [m.file]: apply(texts[m.file], m) })
            const res = await runVitest(dir, files, { bin, config: options.config, timeoutMs })
            writeFiles(dir, { [m.file]: texts[m.file] })
            outcomes.push({ m, res })
          }
        } finally { removeCopy(dir) }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, (_, i) => worker(i)))
      for (const { m, res } of outcomes) {
        result.mutants.run++
        if (res.timedOut) { result.mutants.timedOut++; result.mutants.killed++; continue }
        const loadOnly = res.tests.size === 0 && res.loadErrors.size > 0
        if (loadOnly && [...res.loadErrors.values()].some(compileError)) { result.mutants.invalid++; continue }
        let killed = false
        for (const t of passing) {
          const st = res.loadErrors.has(t.file) ? 'failed' : res.tests.get(`${t.file}::${t.name}`)?.status
          if (st && st !== 'passed') { t.kills++; killed = true }
        }
        if (killed) result.mutants.killed++
        else { result.mutants.survived++; result.survivors.push({ file: m.file, line: m.line, column: m.column, op: m.op, original: m.original.slice(0, 80), replacement: m.replacement, suggestion: suggest(m) }) }
      }
      const valid = result.mutants.run - result.mutants.invalid
      if (valid > 0)
        for (const t of passing) {
          if (t.kills > 0 || t.before === 'passed') continue
          if (allowed('T011', t.file, t.line)) { result.notes.push(`T011 allowed on "${t.name}"`); continue }
          const partial = result.mutants.sampled
          diagnostics.push(diagnostic({
            code: 'T011', severity: partial ? 'warning' : 'error', file: t.file, span: [t.line, 1, t.line, 1],
            why: `"${t.name}" killed none of the ${valid} mutants of the changed lines${partial ? ` (a sample of ${result.mutants.generated})` : ''}: it would still pass if that code were wrong`,
            help: result.survivors[0] ? `Assert what the changed code computes. For example: ${result.survivors[0].suggestion}` : 'Assert what the changed code computes',
          }))
        }
    } else if (!list.length) result.notes.push('no mutants on the changed lines')
  }
  return finish()
}

/** A mutant the compiler or parser rejects never ran, so it counts as neither killed nor survived. */
const compileError = msg => /\bW\d{3}\b|SyntaxError|Transform failed|Parse error|Unexpected token|Expected/.test(msg)

/** Human summary for stderr. */
export function formatGate(r) {
  const lines = []
  for (const t of r.tests) {
    const mark = t.accepted ? '✓' : '✗'
    lines.push(`${mark} ${t.file} › ${t.name}  before: ${t.before ?? '—'}, after: ${t.after}, kills: ${t.kills}${t.codes?.length ? `, ${t.codes.join(' ')}` : ''}${t.after !== 'passed' && t.afterMessage ? `\n    ${t.afterMessage}` : ''}`)
  }
  const m = r.mutants
  if (m.run) lines.push(`mutants: ${m.killed}/${m.run - m.invalid} killed${m.timedOut ? ` (${m.timedOut} by timeout)` : ''}${m.invalid ? `, ${m.invalid} didn't compile` : ''}${m.sampled ? `, sampled from ${m.generated}` : ''}`)
  for (const s of r.survivors.slice(0, 8)) lines.push(`  survived: ${s.suggestion}`)
  for (const n of r.notes) lines.push(`note: ${n}`)
  return lines.join('\n')
}

export { testCases }
