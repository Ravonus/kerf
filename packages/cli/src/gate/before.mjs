import { diagnostic } from '../diag.mjs'
import { copyProject, removeCopy, writeFiles } from '../workspace.mjs'

export async function beforeRun({
  source,
  options,
  log,
  root,
  run,
  testFiles,
  resolveCases,
  byKey,
  allowed,
  result,
  diagnostics,
}) {
  // Before: source reverted, tests and their helpers as they are now. Every changed test must fail.
  if (source.length && !options.refactor) {
    log(`gate: reverting ${source.length} source files; the changed tests must fail`)
    const beforeDir = copyProject(root, { exclude: options.exclude, id: 'before' })
    let before
    try {
      writeFiles(beforeDir, Object.fromEntries(source.map((c) => [c.rel, c.before])))
      before = await run(beforeDir, testFiles)
    } finally {
      removeCopy(beforeDir)
    }
    const beforeStatus = resolveCases(before)
    for (const [key, t] of byKey) {
      const st =
        beforeStatus.get(key) ??
        (before.loadErrors.has(t.file)
          ? { status: 'failed', message: before.loadErrors.get(t.file) }
          : { status: 'missing' })
      t.before = st.status
      t.beforeMessage = st.message
      if (t.after === 'passed' && st.status === 'passed' && allowed('T010', t.file, t.line))
        result.notes.push(`T010 allowed on "${t.name}"`)
      else if (t.after === 'passed' && st.status === 'passed')
        diagnostics.push(
          diagnostic({
            code: 'T010',
            file: t.file,
            span: [t.line, 1, t.line, 1],
            why: `"${t.name}" passes on the code before this change too, so it doesn't test the change`,
            help: "Assert what the change makes different (what the user sees now and didn't before); or, if this is a test for existing behavior, add it in its own change with no source edits",
          }),
        )
    }
  } else if (!options.refactor)
    result.notes.push(
      'no source change: fail-before skipped; mutants come from the source the new tests import',
    )
}
