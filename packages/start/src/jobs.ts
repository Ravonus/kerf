// `@weft-js/start/jobs`: work done after the request that asked for it. `src/jobs.server.ts` default-exports
// `defineJobs({ name: { input?, run } })`; a mutation calls `jobs.name.enqueue(input)`, and a server preset (node, bun,
// deno) works the queue: each job runs at least once, is retried with backoff when it throws, and is set aside (J004)
// when its retries run out.
import { StartError, type Context, type StandardSchemaV1 } from './data'

/** One job as the queue holds it. `attempt` counts the runs started, this one included. */
export interface QueuedJob {
  id: string
  name: string
  input: unknown
  attempt: number
  /** When it may run next, in ms since the epoch. */
  runAt: number
}

/**
 * Where queued jobs wait: `memoryQueue()` by default (one process, lost on restart), `redisQueue()` from
 * `@weft-js/realtime-redis` to survive restarts and share the work between instances.
 */
export interface Queue {
  /** Adds a job. With `key`, false (and nothing added) while a job with that key is still waiting or running. */
  push(job: QueuedJob, key?: string): Promise<boolean>
  /**
   * Up to `max` jobs due at `now`, each counted as one more attempt and hidden until `now + lease` ms: a process that
   * dies mid-job hands it on when the lease ends, so a job runs at least once (and, rarely, more than once).
   */
  claim(now: number, lease: number, max: number): Promise<QueuedJob[]>
  /** It ran: gone, and its key free again. */
  done(job: QueuedJob): Promise<void>
  /** It threw: due again at `runAt`. */
  retry(job: QueuedJob, runAt: number): Promise<void>
  /** Out of retries: off the queue, kept with its error where the queue keeps dead jobs. */
  fail(job: QueuedJob, error: string): Promise<void>
  /** Wakes the runner when a job is added (a queue in this process can say so; a shared one is polled). */
  onPush?(wake: () => void): void
}

/** What a job's `run` gets. */
export interface JobRun<I> {
  ctx: Context
  input: I
  id: string
  name: string
  attempt: number
}

/** One kind of job: what input it takes, what it does, and how often it's tried. */
export interface JobDef<I = any> {
  /** Checked when it's enqueued (J006), so a bad input fails the caller, not a run later. */
  input?: StandardSchemaV1
  run: (args: JobRun<I>) => unknown
  /** Runs after the first that fail before it's dead. Default 5. */
  retries?: number
  /** Milliseconds to wait after a failed attempt. Default 2^attempt seconds, at most an hour. */
  backoff?: (attempt: number) => number
}
/** Jobs by name. */
export type JobDefs = Record<string, JobDef>

/** How a job is enqueued. */
export interface EnqueueOptions {
  /** Milliseconds before it may run. */
  delay?: number
  /** One job per key until it has run: a second `enqueue` with the same key adds nothing and returns `null`. */
  key?: string
}

type InputOf<D> = D extends { input: StandardSchemaV1<infer I, unknown> }
  ? I
  : D extends { run: (args: JobRun<infer I>) => unknown }
    ? I
    : unknown

/** How the runner works the queue. */
export interface RunnerOptions {
  /** Jobs at once in this process. Default 4. */
  concurrency?: number
  /** How long a claimed job is hidden from other instances, in ms. Default 5 minutes: longer than any job runs. */
  lease?: number
  /** How often a shared queue is checked, in ms. Default 1000. */
  poll?: number
}

const STATE = Symbol.for('weft.jobs')
/** What the runner reads off `defineJobs`'s result. */
export interface JobsState {
  defs: JobDefs
  queue: Queue
  runner: RunnerOptions
}
/** What `defineJobs` returns: an `enqueue` per job. `src/jobs.server.ts` default-exports it. */
export type Jobs<D extends JobDefs = JobDefs> = {
  [K in keyof D]: {
    /** Queues one run; the job's id, or `null` when `key` matched a job still waiting. */
    enqueue(
      ...args: undefined extends InputOf<D[K]>
        ? [input?: InputOf<D[K]>, options?: EnqueueOptions]
        : [input: InputOf<D[K]>, options?: EnqueueOptions]
    ): Promise<string | null>
  }
} & { readonly [STATE]: JobsState }

/** One job, typed: `run` gets what `input`'s schema outputs. */
export function job<S extends StandardSchemaV1>(
  def: Omit<JobDef, 'input' | 'run'> & {
    input: S
    run: (args: JobRun<NonNullable<S['~standard']['types']>['output']>) => unknown
  },
): JobDef & { input: S }
export function job<I = undefined>(def: JobDef<I>): JobDef<I>
export function job(def: JobDef): JobDef {
  return def
}

/** The app's jobs, on `queue` (memory by default). */
export function defineJobs<const D extends JobDefs>(
  defs: D,
  options: RunnerOptions & { queue?: Queue } = {},
): Jobs<D> {
  const { queue = memoryQueue(), ...runner } = options
  const out: Record<string, unknown> = {}
  for (const [name, def] of Object.entries(defs))
    out[name] = {
      async enqueue(input?: unknown, opts: EnqueueOptions = {}) {
        let value = input
        if (def.input) {
          const r = await def.input['~standard'].validate(input)
          if (r.issues)
            throw new StartError(
              'J006',
              `job \`${name}\` rejected its input: ${r.issues.map((i) => i.message).join('; ')}`,
              'enqueue what its schema accepts',
              { status: 400 },
            )
          value = r.value
        }
        const id = crypto.randomUUID()
        const added = await queue.push(
          { id, name, input: value, attempt: 0, runAt: Date.now() + (opts.delay ?? 0) },
          opts.key,
        )
        return added ? id : null
      },
    }
  Object.defineProperty(out, STATE, { value: { defs, queue, runner } satisfies JobsState })
  return out as Jobs<D>
}

/** The definitions and queue behind `defineJobs`'s result. */
export function jobsState(jobs: object): JobsState | undefined {
  return (jobs as { [STATE]?: JobsState })[STATE]
}

/** The default wait after attempt `n` fails: 2^n seconds, at most an hour. */
export const backoff = (attempt: number) => Math.min(3600, 2 ** attempt) * 1000

/** A dead job, as `memoryQueue().dead` keeps it. */
export interface DeadJob extends QueuedJob {
  error: string
  at: number
}

/**
 * The queue in this process: nothing to set up, and nothing survives a restart or reaches another instance. Use
 * `redisQueue()` for jobs that must not be lost. Keeps the last `deadLimit` dead jobs in `dead`.
 */
export function memoryQueue({ deadLimit = 100 }: { deadLimit?: number } = {}): Queue & {
  dead: DeadJob[]
  size(): number
} {
  const jobs = new Map<string, QueuedJob & { key?: string }>()
  const keys = new Map<string, string>()
  const dead: DeadJob[] = []
  const wakes: (() => void)[] = []
  const drop = (job: QueuedJob) => {
    const held = jobs.get(job.id)
    if (held?.key) keys.delete(held.key)
    jobs.delete(job.id)
  }
  return {
    dead,
    size: () => jobs.size,
    async push(job, key) {
      if (key !== undefined && keys.has(key)) return false
      if (key !== undefined) keys.set(key, job.id)
      jobs.set(job.id, { ...job, ...(key !== undefined && { key }) })
      for (const wake of wakes) wake()
      return true
    },
    async claim(now, lease, max) {
      const out: QueuedJob[] = []
      for (const job of jobs.values()) {
        if (out.length >= max) break
        if (job.runAt > now) continue
        job.attempt++
        job.runAt = now + lease
        out.push({ id: job.id, name: job.name, input: job.input, attempt: job.attempt, runAt: now })
      }
      return out
    },
    async done(job) {
      drop(job)
    },
    async retry(job, runAt) {
      const held = jobs.get(job.id)
      if (held) held.runAt = runAt
    },
    async fail(job, error) {
      drop(job)
      dead.push({ ...job, error, at: Date.now() })
      if (dead.length > deadLimit) dead.splice(0, dead.length - deadLimit)
    },
    onPush(wake) {
      wakes.push(wake)
    },
  }
}
