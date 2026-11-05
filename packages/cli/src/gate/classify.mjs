import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { discover } from '../files.mjs'
import { changedCases, weakened } from '../testdiff.mjs'
import { allowances, checkTestFile, isTestFile, parse } from '../tests.mjs'

export function classify(root, changes, code, configFile, importsOf) {
  // Tests, test support (helpers only tests import) and source.
  const tests = changes.filter((c) => isTestFile(c.rel))
  const others = changes.filter((c) => !isTestFile(c.rel) && code(c.rel) && !configFile(c.rel))
  const testAbs = new Set(
    discover(root, {
      include: ['**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
      exclude: ['.weft/**'],
    }).map((r) => join(root, r)),
  )
  const importedBySource = new Set()
  for (const rel of discover(root, {
    include: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    exclude: ['.weft/**'],
  })) {
    const abs = join(root, rel)
    if (testAbs.has(abs)) continue
    for (const p of importsOf(abs, readFileSync(abs, 'utf8'))) importedBySource.add(p)
  }
  const importedByTests = new Set()
  for (const abs of testAbs)
    for (const p of importsOf(abs, readFileSync(abs, 'utf8'))) importedByTests.add(p)
  const isSupport = (rel) =>
    importedByTests.has(join(root, rel)) &&
    !importedBySource.has(join(root, rel)) &&
    !rel.match(/(^|\/)src\//)
  const support = others.filter((c) => isSupport(c.rel))
  const source = others.filter((c) => !isSupport(c.rel))

  // Static: T020 on every changed test file, T001–T009 on the ones that still exist (T005 blocks here).
  const diagnostics = []
  for (const c of tests) diagnostics.push(...weakened(c.before, c.after, c.rel))
  for (const c of tests) {
    if (c.after == null) continue
    for (const d of checkTestFile(c.after, c.rel, { abs: join(root, c.rel), root })) {
      if (d.code === 'T005' && d.severity === 'warning') {
        d.severity = 'error'
        d.why += ' The gate blocks implementation queries in new and changed tests.'
      }
      diagnostics.push(d)
    }
  }

  // The tests this change has to prove.
  // `// weft-allow T010: <reason>` / T011 on a test keeps it (shown in the result, for the reviewer).
  const allowFns = new Map(
    tests
      .filter((c) => c.after != null)
      .map((c) => [c.rel, allowances(c.after, parse(c.after, c.rel))]),
  )
  const allowed = (rule, file, line) => allowFns.get(file)?.(rule, line) ?? false
  const cases = tests
    .filter((c) => c.after != null)
    .flatMap((c) =>
      changedCases(c.before, c.after, c.rel).map((t) => ({
        file: c.rel,
        name: t.name,
        line: t.line,
        end: t.end,
        dynamic: t.dynamic,
      })),
    )
  const testFiles = [...new Set(cases.map((c) => c.file))]

  return { tests, support, source, isSupport, diagnostics, allowed, cases, testFiles }
}
