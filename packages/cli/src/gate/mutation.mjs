import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { diagnostic } from '../diag.mjs'
import { apply, changedLines, mutants as makeMutants, sample, suggest } from '../mutate.mjs'
import { isTestFile } from '../tests.mjs'
import { copyProject, removeCopy, runVitest, writeFiles } from '../workspace.mjs'

export async function mutate({
  options,
  root,
  source,
  testFiles,
  importsOf,
  code,
  posix,
  isSupport,
  maxMutants,
  byKey,
  result,
  log,
  concurrency,
  budgetSec,
  started,
  after,
  bin,
  compileError,
  allowed,
  diagnostics,
}) {
  // Mutation: the changed source lines (or, with no source change, the source files the tests import).
  if (options.mutation !== false) {
    const targets = mutationTargets({
      root,
      source,
      testFiles,
      importsOf,
      code,
      posix,
      isSupport,
      result,
    })
    const all = targets.flatMap((t) => makeMutants(t.text, t.rel, t.lines))
    const list = sample(all, maxMutants)
    result.mutants.generated = all.length
    result.mutants.sampled = list.length < all.length
    const passing = [...byKey.values()].filter((t) => t.after === 'passed')
    const files = [...new Set(passing.map((t) => t.file))]
    if (list.length && files.length) {
      log(
        `gate: ${list.length}${result.mutants.sampled ? ` of ${all.length}` : ''} mutants on ${targets.length} files, ${concurrency} at a time, ${budgetSec}s budget`,
      )
      const outcomes = await runMutants({
        root,
        options,
        targets,
        started,
        budgetSec,
        after,
        list,
        result,
        files,
        bin,
        concurrency,
      })
      recordMutants({ outcomes, result, compileError, passing, allowed, diagnostics })
    } else if (!list.length) result.notes.push('no mutants on the changed lines')
  }
}

function mutationTargets({ root, source, testFiles, importsOf, code, posix, isSupport, result }) {
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
  const unreached = source
    .filter((c) => c.after != null && code(c.rel) && !reachable.has(join(root, c.rel)))
    .map((c) => c.rel)
  if (unreached.length)
    result.notes.push(`not mutated (no changed test imports them): ${unreached.join(', ')}`)
  let targets = source
    .filter((c) => c.after != null && reachable.has(join(root, c.rel)))
    .map((c) => ({ rel: c.rel, text: c.after, lines: changedLines(c.before, c.after) }))
  if (!source.length) {
    targets = [...reach(3)]
      .map((abs) => posix(relative(root, abs)))
      .filter(
        (rel) =>
          !isTestFile(rel) &&
          code(rel) &&
          !isSupport(rel) &&
          !rel.startsWith('..') &&
          !rel.includes('node_modules'),
      )
      .map((rel) => {
        const text = readFileSync(join(root, rel), 'utf8')
        return { rel, text, lines: changedLines(null, text) }
      })
  }
  return targets
}

async function runMutants({
  root,
  options,
  targets,
  started,
  budgetSec,
  after,
  list,
  result,
  files,
  bin,
  concurrency,
}) {
  const texts = Object.fromEntries(targets.map((t) => [t.rel, t.text]))
  const deadline = started + budgetSec * 1000 + after.ms
  const timeoutMs = Math.max(15_000, after.ms * 3)
  const queue = [...list]
  const outcomes = []
  const worker = async (i) => {
    const dir = copyProject(root, { exclude: options.exclude, id: `mutant-${i}` })
    try {
      for (let m; (m = queue.shift());) {
        if (performance.now() > deadline) {
          result.mutants.sampled = true
          queue.length = 0
          break
        }
        writeFiles(dir, { [m.file]: apply(texts[m.file], m) })
        const res = await runVitest(dir, files, { bin, config: options.config, timeoutMs })
        writeFiles(dir, { [m.file]: texts[m.file] })
        outcomes.push({ m, res })
      }
    } finally {
      removeCopy(dir)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, (_, i) => worker(i)))
  return outcomes
}

function recordMutants({ outcomes, result, compileError, passing, allowed, diagnostics }) {
  for (const { m, res } of outcomes) {
    result.mutants.run++
    if (res.timedOut) {
      result.mutants.timedOut++
      result.mutants.killed++
      continue
    }
    const loadOnly = res.tests.size === 0 && res.loadErrors.size > 0
    if (loadOnly && [...res.loadErrors.values()].some(compileError)) {
      result.mutants.invalid++
      continue
    }
    let killed = false
    for (const t of passing) {
      const st = res.loadErrors.has(t.file)
        ? 'failed'
        : res.tests.get(`${t.file}::${t.name}`)?.status
      if (st && st !== 'passed') {
        t.kills++
        killed = true
      }
    }
    if (killed) result.mutants.killed++
    else {
      result.mutants.survived++
      result.survivors.push({
        file: m.file,
        line: m.line,
        column: m.column,
        op: m.op,
        original: m.original.slice(0, 80),
        replacement: m.replacement,
        suggestion: suggest(m),
      })
    }
  }
  const valid = result.mutants.run - result.mutants.invalid
  if (valid > 0)
    for (const t of passing) {
      if (t.kills > 0 || t.before === 'passed') continue
      if (allowed('T011', t.file, t.line)) {
        result.notes.push(`T011 allowed on "${t.name}"`)
        continue
      }
      const partial = result.mutants.sampled
      diagnostics.push(
        diagnostic({
          code: 'T011',
          severity: partial ? 'warning' : 'error',
          file: t.file,
          span: [t.line, 1, t.line, 1],
          why: `"${t.name}" killed none of the ${valid} mutants of the changed lines${partial ? ` (a sample of ${result.mutants.generated})` : ''}: it would still pass if that code were wrong`,
          help: result.survivors[0]
            ? `Assert what the changed code computes. For example: ${result.survivors[0].suggestion}`
            : 'Assert what the changed code computes',
        }),
      )
    }
}
