import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { activity, checkInit, leaks, usage } from '../lib/transcript.mjs'

export const infra = (r) =>
  !r ||
  (r.is_error &&
    /api_error|auth/.test(`${r.terminal_reason}`) &&
    r.subtype !== 'error_max_budget_usd')

export function firstRunGrade(rec, grade, passedAll) {
  if (grade)
    rec.first.hidden = {
      passed: grade.passed,
      total: grade.total,
      failed: grade.failed?.map((f) => f.title),
      flaky: grade.flaky ?? 0,
      buildMs: grade.built.ms,
    }
  rec.first.pass = grade ? passedAll(grade) : false
}

export async function finishRun({
  a,
  last,
  rec,
  box,
  stackName,
  task,
  startedAt,
  dir,
  gradeOnce,
  cleanup,
  load,
  passedAll,
}) {
  const finalGrade = rec.infra ? null : await gradeOnce(box, stackName, task, 9, true)
  await a.stop()
  const results = a.events.filter((e) => e.type === 'result')
  const whole = usage(last)
  if (whole) whole.turns = results.reduce((n, r) => n + (r.num_turns ?? 0), 0) // per exchange in the CLI, where tokens and cost are cumulative
  rec.final = {
    usage: whole,
    hidden: finalGrade && {
      passed: finalGrade.passed,
      total: finalGrade.total,
      failed: finalGrade.failed?.map((f) => f.title),
      flaky: finalGrade.flaky ?? 0,
    },
    pass: finalGrade ? passedAll(finalGrade) : false,
    bugsLeft: finalGrade
      ? finalGrade.total === null
        ? null
        : finalGrade.total - finalGrade.passed
      : null,
  }
  rec.quality = finalGrade?.quality
  rec.wallMs = Date.now() - startedAt
  rec.loadAfter = load()
  rec.status = a.status().timedOut ? 'timeout' : (last?.subtype ?? 'died')
  rec.activity = activity(a.events)
  rec.isolation = { init: checkInit(a.events), leaks: leaks(a.events) }
  appendFileSync(join(dir, 'runs.jsonl'), JSON.stringify(rec) + '\n')
  cleanup(box)
  return rec
}
