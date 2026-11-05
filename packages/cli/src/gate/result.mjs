import { sortDiagnostics, summarize } from '../diag.mjs'

export function makeResult({
  root,
  options,
  tests,
  support,
  source,
  diagnostics,
  budgetSec,
  started,
}) {
  const result = {
    version: 1,
    ok: true,
    root,
    base: options.changes ? null : (options.base ?? 'HEAD'),
    files: {
      tests: tests.map((c) => c.rel),
      support: support.map((c) => c.rel),
      source: source.map((c) => c.rel),
    },
    tests: [],
    mutants: {
      generated: 0,
      run: 0,
      killed: 0,
      survived: 0,
      timedOut: 0,
      invalid: 0,
      sampled: false,
      budgetSec,
    },
    survivors: [],
    diagnostics,
    summary: null,
    notes: [],
    ms: 0,
  }
  const finish = () => {
    sortDiagnostics(diagnostics)
    // Each test's verdict: it ran green on the change, failed before it (when there was a before), and no error
    // diagnostic falls inside it.
    for (const t of result.tests) {
      t.codes = diagnostics
        .filter(
          (d) =>
            d.severity === 'error' &&
            d.file === t.file &&
            d.span[0] >= t.line &&
            d.span[0] <= t.end,
        )
        .map((d) => d.code)
      t.accepted = t.after === 'passed' && t.before !== 'passed' && !t.codes.length
    }
    result.summary = { changedTests: result.tests.length, ...summarize(diagnostics) }
    result.ok = result.summary.errors === 0 && result.tests.every((t) => t.accepted)
    result.ms = Math.round(performance.now() - started)
    return result
  }

  return { result, finish }
}
