import {
  backoff as defaultBackoff,
  jobsState,
  type JobDefs,
  type Jobs,
  type Queue,
  type QueuedJob,
} from '../jobs'
import { errorText, inScope, type BackgroundDeps } from './background'

type Report = BackgroundDeps['scopeOptions']['onDiagnostic']

/** Runs one claimed job, then marks it done, due again after its backoff (J003), or dead (J004). */
function settler(defs: JobDefs, queue: Queue, deps: BackgroundDeps) {
  const report: Report = deps.scopeOptions.onDiagnostic
  const dead = async (job: QueuedJob, why: string) => {
    await queue.fail(job, why)
    report?.({
      code: 'J004',
      severity: 'error',
      message: `J004: job \`${job.name}\` (${job.id}) is dead: ${why}`,
    })
  }
  return async (job: QueuedJob) => {
    const def = defs[job.name]
    const retries = def?.retries ?? 5
    // A job no definition names (renamed, removed), or one whose leases ran out as often as its retries: a process
    // died running it every time.
    if (!def) return dead(job, 'no job by that name is defined')
    if (job.attempt > retries + 1) return dead(job, 'its process stopped on every attempt')
    try {
      await inScope(deps, `/_weft/jobs/${encodeURIComponent(job.name)}`, (ctx) =>
        def.run({ ctx, input: job.input, id: job.id, name: job.name, attempt: job.attempt }),
      )
      await queue.done(job)
    } catch (e) {
      const error = errorText(e)
      if (job.attempt > retries)
        return dead(job, `out of retries after ${job.attempt} attempts: ${error}`)
      const wait = (def.backoff ?? defaultBackoff)(job.attempt)
      await queue.retry(job, Date.now() + wait)
      report?.({
        code: 'J003',
        severity: 'warning',
        message: `J003: job \`${job.name}\` (${job.id}) failed attempt ${job.attempt}, retrying in ${Math.round(wait / 1000)}s: ${error}`,
      })
    }
  }
}

/**
 * Works the app's job queue: claims what's due (up to `concurrency` at once) and runs each with the app's `ctx`. A
 * shared queue is polled; the memory queue also wakes the runner when a job is added. The returned function stops
 * claiming and resolves when the jobs running have finished.
 */
export function startJobs(jobs: Jobs, deps: BackgroundDeps): () => Promise<void> {
  const state = jobsState(jobs)
  if (!state) return () => Promise.resolve()
  const { defs, queue, runner } = state
  const concurrency = runner.concurrency ?? 4
  const lease = runner.lease ?? 5 * 60_000
  const poll = runner.poll ?? 1000
  const settle = settler(defs, queue, deps)
  const running = new Set<Promise<void>>()
  const failed = (e: unknown) =>
    deps.scopeOptions.onDiagnostic?.({
      code: 'J004',
      severity: 'error',
      message: `J004: the job queue failed: ${errorText(e)}`,
    })
  const live = { stopped: false, claiming: false }
  let timer: ReturnType<typeof setTimeout> | undefined

  const start = (job: QueuedJob) => {
    const p: Promise<void> = settle(job)
      .catch(failed)
      .finally(() => {
        running.delete(p)
        void tick()
      })
    running.add(p)
  }
  const tick = async () => {
    if (live.stopped || live.claiming) return
    live.claiming = true
    clearTimeout(timer)
    try {
      for (;;) {
        const room = concurrency - running.size
        if (live.stopped || room <= 0) break
        const claimed = await queue.claim(Date.now(), lease, room)
        if (!claimed.length) break
        claimed.forEach(start)
      }
    } catch (e) {
      failed(e)
    } finally {
      live.claiming = false
      if (!live.stopped) {
        timer = setTimeout(() => void tick(), poll)
        ;(timer as { unref?: () => void }).unref?.() // the queue never keeps a process alive by itself
      }
    }
  }
  queue.onPush?.(() => void tick())
  void tick()
  return async () => {
    live.stopped = true
    clearTimeout(timer)
    await Promise.allSettled([...running])
  }
}
