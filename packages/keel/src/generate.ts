// Generators off the main thread: `await generate('bust', recipe)` meshes a portrait's bust in a worker, and
// 'plate' and 'surface' paint there on an `OffscreenCanvas`. Results come back as `{ digest, buffers }`-shaped plain
// data with their buffers transferred, kept by the job's key for the page's life (and across visits in Cache Storage),
// so asking twice costs nothing. Without workers (a test, a server) the job runs here, after an `import()`.
import type { Surface } from '../vendor/modules/surfaces.mjs'
import type { BustJob, BustResult } from './generate/bust'
import type { PlateJob, PlateResult } from './generate/plate'
import type { Request } from './generate/serve'
import type { PaintRecipe } from './paint-recipe.mjs'

export type { BustJob, BustResult, PlateJob, PlateResult, PaintRecipe }

/** Each job: what it takes and what it gives. */
export interface GenerateJobs {
  /** portrait's `buildBust`, from settings or a recipe: then `createPortrait(lit, bust, bust.palette)` here. */
  bust: { args: BustJob; result: BustResult }
  /** plate-painter's plate at a frame's size, read back: `new lit.DataTexture(data, width, height)`. */
  plate: { args: PlateJob; result: PlateResult }
  /** A surface's albedo and relief, as `paintLive` and `?paint` take it. */
  surface: { args: PaintRecipe; result: Surface }
}
/** A job's name: `bust`, `plate` or `surface`. */
export type GenerateJob = keyof GenerateJobs

/** How long a result is kept. */
export interface GenerateOptions {
  /** For the page's life, so asking again costs nothing. Default true, false for `plate` (one per canvas size). */
  readonly keep?: boolean
  /** In Cache Storage too, for the next visit (secure contexts, built pages). Default as `keep`. */
  readonly store?: boolean
}

type Answer = { id: number; result?: unknown; error?: string }

const kept = new Map<string, Promise<unknown>>()
const workers = new Map<GenerateJob, Worker | null>()
const waiting = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
let next = 0

/** Each worker named in full, so the bundler finds and builds it. */
function spawn(job: GenerateJob): Worker {
  if (job === 'bust')
    return new Worker(new URL('./generate/bust.worker.ts', import.meta.url), {
      type: 'module',
      name: 'keel-bust',
    })
  if (job === 'plate')
    return new Worker(new URL('./generate/plate.worker.ts', import.meta.url), {
      type: 'module',
      name: 'keel-plate',
    })
  return new Worker(new URL('./generate/surface.worker.ts', import.meta.url), {
    type: 'module',
    name: 'keel-surface',
  })
}

function workerFor(job: GenerateJob): Worker | null {
  if (!workers.has(job)) {
    const worker = typeof Worker === 'undefined' ? null : spawn(job)
    worker?.addEventListener('message', ({ data }: MessageEvent<Answer>) => {
      const wait = waiting.get(data.id)
      waiting.delete(data.id)
      if (data.error === undefined) wait?.resolve(data.result)
      else wait?.reject(new Error(data.error))
    })
    workers.set(job, worker)
  }
  return workers.get(job)!
}

/** In this thread: for a page with no workers, and the fallback when a worker can't (a plate without WebGL2 there). */
async function here(job: GenerateJob, args: unknown): Promise<unknown> {
  const jobs = {
    bust: () => import('./generate/bust'),
    plate: () => import('./generate/plate'),
    surface: () => import('./generate/surface'),
  }
  const { run } = await jobs[job]()
  return (run as (a: unknown) => unknown)(args)
}

/** The same JSON for the same value, whatever order its keys were written in. */
export function keyOf(job: GenerateJob, args: unknown): string {
  const sorted = (v: unknown): unknown =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort((a, b) => a.localeCompare(b))
            .map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
        )
      : Array.isArray(v)
        ? v.map(sorted)
        : v
  return `${job}:${JSON.stringify(sorted(args))}`
}

/**
 * Runs a generator in its worker: `const bust = await generate('bust', recipe)`. The same job and args give the same
 * promise for the page's life; `forget(job, args)` drops it. Data only: upload textures and geometry here.
 */
export function generate<J extends GenerateJob>(
  job: J,
  args: GenerateJobs[J]['args'],
  options: GenerateOptions = {},
): Promise<GenerateJobs[J]['result']> {
  const key = keyOf(job, args)
  const keep = options.keep ?? job !== 'plate'
  let result = kept.get(key)
  if (!result) {
    const worker = workerFor(job)
    const store = options.store ?? keep
    result = worker
      ? new Promise((resolve, reject) => {
          const id = next++
          waiting.set(id, { resolve, reject })
          worker.postMessage({ id, key, args, store } satisfies Request)
        }).catch(() => here(job, args))
      : here(job, args)
    // A failed job is not kept, so asking again tries again; one not to keep is shared only while it runs.
    void result.then(
      () => keep || kept.delete(key),
      () => kept.delete(key),
    )
    kept.set(key, result)
  }
  return result as Promise<GenerateJobs[J]['result']>
}

/** Drops a kept result, so its buffers can be freed once nothing else holds them. */
export function forget<J extends GenerateJob>(job: J, args: GenerateJobs[J]['args']) {
  kept.delete(keyOf(job, args))
}
