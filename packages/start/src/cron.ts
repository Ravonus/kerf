// `@weft-js/start/cron`: jobs on a schedule. `src/cron.server.ts` default-exports `defineCron({ name: { schedule, run } })`;
// a server preset (node, bun, deno) runs each at its minute, in UTC, on one instance at a time.
import { StartError, type Context } from './data'

/** One scheduled job: a 5-field cron schedule in UTC (`'0 3 * * *'` is 03:00 every day) and what it runs. */
export interface CronJob {
  schedule: string
  /** Runs with the app's `ctx` (no request user). A failure is logged (J001); the next minute it's due runs again. */
  run: (args: { ctx: Context; name: string; at: Date }) => unknown
}
/** What `src/cron.server.ts` default-exports: jobs by name. */
export type CronJobs = Record<string, CronJob>

/** The jobs, checked: a schedule that doesn't parse is J002 when the server starts, not a silent no-op. */
export function defineCron<J extends CronJobs>(jobs: J): J {
  for (const [name, job] of Object.entries(jobs)) matcher(job.schedule, name)
  return jobs
}

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
] as const

function field(
  text: string,
  { name, min, max }: (typeof FIELDS)[number],
  job: string,
): Set<number> {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part)
    const lo = m?.[1] === '*' ? min : Number(m?.[2])
    const hi = m?.[1] === '*' ? max : m?.[3] !== undefined ? Number(m[3]) : m?.[4] ? max : lo
    const step = m?.[4] !== undefined ? Number(m[4]) : 1
    if (!m || lo < min || hi > max || lo > hi || step < 1)
      throw new StartError(
        'J002',
        `cron job \`${job}\`: \`${part}\` isn't a ${name} (${min}–${max})`,
        'five fields: minute hour day-of-month month day-of-week, with `*`, `*/n`, `a-b` and lists',
      )
    for (let v = lo; v <= hi; v += step) out.add(name === 'day of week' && v === 7 ? 0 : v)
  }
  return out
}

/** A schedule as a test for one minute (UTC). Day of month and day of week, both set, match either (as cron does). */
export function matcher(schedule: string, job = 'job'): (at: Date) => boolean {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5)
    throw new StartError(
      'J002',
      `cron job \`${job}\`: \`${schedule}\` has ${parts.length} fields, not 5`,
      'minute hour day-of-month month day-of-week, e.g. `0 3 * * *`',
    )
  const [mi, h, dom, mo, dow] = parts.map((p, i) => field(p, FIELDS[i]!, job))
  const anyDom = parts[2] === '*',
    anyDow = parts[4] === '*'
  return (at) => {
    const day =
      anyDom || anyDow
        ? dom!.has(at.getUTCDate()) && dow!.has(at.getUTCDay())
        : dom!.has(at.getUTCDate()) || dow!.has(at.getUTCDay())
    return (
      mi!.has(at.getUTCMinutes()) &&
      h!.has(at.getUTCHours()) &&
      mo!.has(at.getUTCMonth() + 1) &&
      day
    )
  }
}
