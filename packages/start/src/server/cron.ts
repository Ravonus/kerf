import { matcher, type CronJobs } from '../cron'
import { errorText, inScope, type BackgroundDeps } from './background'

/**
 * Runs the app's cron jobs: a timer wakes at each minute, and every job due then runs once. With several instances
 * the cache store decides which one runs it (a window per job and minute, one call allowed): with `redisStore()`
 * that's exactly one; with the memory store each instance counts alone, so each runs it.
 */
export function startCron(jobs: CronJobs, deps: BackgroundDeps): () => void {
  const due = Object.entries(jobs).map(([name, job]) => ({
    name,
    job,
    at: matcher(job.schedule, name),
  }))
  if (!due.length) return () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = async () => {
    const at = new Date(Math.floor(Date.now() / 60_000) * 60_000)
    arm()
    for (const { name, job, at: matches } of due) {
      if (!matches(at)) continue
      const claim = await deps.store.consume?.(`cron:${name}:${at.getTime()}`, {
        window: 120,
        max: 1,
      })
      if (claim && !claim.allowed) continue
      void run(name, job, at)
    }
  }
  const run = async (name: string, job: CronJobs[string], at: Date) => {
    try {
      await inScope(deps, `/_weft/cron/${encodeURIComponent(name)}`, (ctx) =>
        job.run({ ctx, name, at }),
      )
    } catch (e) {
      deps.scopeOptions.onDiagnostic?.({
        code: 'J001',
        severity: 'error',
        message: `J001: cron job \`${name}\` failed: ${errorText(e)}`,
      })
    }
  }
  const arm = () => {
    timer = setTimeout(() => void tick(), 60_000 - (Date.now() % 60_000) + 50)
    ;(timer as { unref?: () => void }).unref?.() // a schedule never keeps a process alive by itself
  }
  arm()
  return () => clearTimeout(timer)
}
