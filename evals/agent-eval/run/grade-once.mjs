// The shared build, serve and hidden-test path for evaluations and calibration.
import { join } from 'node:path'
import { build, cloneForGrading, hidden, quality, serve } from '../lib/grade.mjs'
import { goldens } from '../lib/paths.mjs'
import { taskReadiness } from './readiness.mjs'

export async function gradeOnce(box, stackName, task, n, withQuality, options) {
  if (!options.calibration) {
    const problems = taskReadiness(task, { gradeable: options.gradeable })
    if (problems.length) throw new Error(problems[0])
  }
  const copy = await cloneForGrading(box, n)
  const built = await build(copy, options.stack)
  if (!built.ok)
    return {
      built,
      passed: 0,
      total: null,
      failed: [{ title: 'the app builds', failure: built.error }],
    }
  let server
  try {
    server = await serve(copy, options.stack)
  } catch (error) {
    return {
      built,
      passed: 0,
      total: null,
      failed: [{ title: 'the app starts', failure: error.message }],
    }
  }
  try {
    const out = { built, ...(await hidden(task, server.base)) }
    if (withQuality)
      out.quality = await quality(task, server.base, copy, join(goldens, stackName, 'app'))
    return out
  } finally {
    server.stop()
  }
}
