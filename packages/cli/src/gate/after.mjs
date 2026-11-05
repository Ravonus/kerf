import { copyProject, removeCopy } from '../workspace.mjs'
import { resolver } from './resolve-cases.mjs'

export async function afterRun({ cases, testFiles, log, root, options, run, result }) {
  // After: the change as it stands. Every changed test must pass.
  log(
    `gate: ${cases.length} new or changed tests in ${testFiles.length} files; running them on the change`,
  )
  const afterDir = copyProject(root, { exclude: options.exclude, id: 'after' })
  let after
  try {
    after = await run(afterDir, testFiles)
  } finally {
    removeCopy(afterDir)
  }
  const resolveCases = resolver(testFiles, cases)
  const afterStatus = resolveCases(after)
  const byKey = new Map()
  for (const [key, st] of afterStatus) {
    const [file, name] = key.split('::')
    const c =
      cases.find((x) => x.file === file && x.name === name) ??
      cases.find((x) => x.file === file && x.dynamic)
    const t = {
      file,
      name,
      line: c?.line ?? 1,
      end: c?.end ?? c?.line ?? 1,
      after: st.status,
      afterMessage: st.status === 'passed' ? undefined : st.message,
      before: null,
      kills: 0,
    }
    byKey.set(key, t)
    result.tests.push(t)
  }
  if (after.timedOut) result.notes.push('the run on the change timed out')

  return { after, resolveCases, byKey }
}
