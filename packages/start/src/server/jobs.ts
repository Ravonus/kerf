import { backoff as defaultBackoff, jobsState, type Jobs, type QueuedJob } from '../jobs'
import { errorText, inScope, type BackgroundDeps } from './background'

/**
 * Works the app's job queue: claims what's due (up to `concurrency` at once), runs each with the app's `ctx`, and
 * marks it done, due again after its backoff (J003), or dead when its retries are spent (J004). A shared queue is
 * polled; the memory queue also wakes the runner when a job is added. The returned function stops claiming and
 * resolves when the jobs running have finished.
 */
export function startJobs(jobs: Jobs, deps: BackgroundDeps): () => Promise<void> {
  const state = jobsState(jobs)
  if (!state) return async () => {}
  const { defs, queue, runner } = state
  const concurrency = runner.concurrency ?? 4
  const lease = runner.lease ?? 5 * 60_000
  const poll = runner.poll ?? 1000
  const running = new Set<Promise<void>>()
  const report = deps.scopeOptions.onDiagnostic
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let claiming = false

  const run = async (job: QueuedJob) => {
    const def = defs[job.name]
    const retries = def?.retries ?? 5
    if (!def || job.attempt > retries + 1) {
      // A job no definition names (renamed, removed), or one whose leases ran out as often as its retries: a process
      // died running it every time.
      const why = def ? 'its process stopped on every attempt' : 'no job by that name is defined'
      await queue.fail(job, why)
      report?.({
        code: 'J004',
        severity: 'error',
        message: `J004: job \`${job.name}\` (${job.id}) is dead: ${why}`,
      })
      return
    }
    try {
      await inScope(deps, `/_weft/jobs/${encodeURIComponent(job.name)}`, (ctx) =>
        def.run({ ctx, input: job.input, id: job.id, name: job.name, attempt: job.attempt }),
      )
      await queue.done(job)
    } catch (e) {
      const error = errorText(e)
      if (job.attempt > retries) {
        await queue.fail(job, error)
        report?.({
          code: 'J004',
          severity: 'error',
          message: `J004: job \`${job.name}\` (${job.id}) is dead after ${job.attempt} attempts: ${error}`,
        })
        return
      }
      const wait = (def.backoff ?? defaultBackoff)(job.attempt)
      await queue.retry(job, Date.now() + wait)
      report?.({
        code: 'J003',
        severity: 'warning',
        message: `J003: job \`${job.name}\` (${job.id}) failed attempt ${job.attempt}, retrying in ${Math.round(wait / 1000)}s: ${error}`,
      })
    }
  }

  const tick = async () => {
    if (stopped || claiming) return
    claiming = true
    clearTimeout(timer)
    try {
      while (!stopped && running.size < concurrency) {
        const claimed = await queue.claim(Date.now(), lease, concurrency - running.size)
        if (!claimed.length) break
        for (const job of claimed) {
          const p = run(job)
            .catch((e: unknown) =>
              report?.({
                code: 'J004',
                severity: 'error',
                message: `J004: the job queue failed: ${errorText(e)}`,
              }),
            )
            .finally(() => {
              running.delete(p)
              void tick()
            })
          running.add(p)
        }
      }
    } catch (e) {
      report?.({
        code: 'J004',
        severity: 'error',
        message: `J004: the job queue failed: ${errorText(e)}`,
      })
    } finally {
      claiming = false
      if (!stopped) {
        timer = setTimeout(() => void tick(), poll)
        ;(timer as { unref?: () => void }).unref?.() // the queue never keeps a process alive by itself
      }
    }
  }
  queue.onPush?.(() => void tick())
  void tick()
  return async () => {
    stopped = true
    clearTimeout(timer)
    await Promise.allSettled([...running])
  }
}
