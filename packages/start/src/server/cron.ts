import { matcher, type CronJobs } from '../cron'
import * as exec from '../exec'
import type { Scope, ScopeOptions, Store } from '../exec'

/**
 * Runs the app's cron jobs: a timer wakes at each minute, and every job due then runs once. With several instances
 * the cache store decides which one runs it (a window per job and minute, one call allowed): with `redisStore()`
 * that's exactly one; with the memory store each instance counts alone, so each runs it.
 */
export function startCron(
  jobs: CronJobs,
  deps: {
    scopeOptions: ScopeOptions
    store: Store
    boot: () => Promise<void>
    origin: string
    enter: (scope: Scope, run: () => Promise<void>) => Promise<void>
  },
): () => void {
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
    const request = new Request(`${deps.origin}/_weft/cron/${encodeURIComponent(name)}`)
    const scope = exec.createScope(request, deps.scopeOptions)
    try {
      await deps.boot()
      await deps.enter(scope, async () => {
        await job.run({ ctx: await scope.ctx(), name, at })
      })
    } catch (e) {
      deps.scopeOptions.onDiagnostic?.({
        code: 'J001',
        severity: 'error',
        message: `J001: cron job \`${name}\` failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
      })
    } finally {
      void exec.finishScope(scope)
    }
  }
  const arm = () => {
    timer = setTimeout(() => void tick(), 60_000 - (Date.now() % 60_000) + 50)
    ;(timer as { unref?: () => void }).unref?.() // a schedule never keeps a process alive by itself
  }
  arm()
  return () => clearTimeout(timer)
}
