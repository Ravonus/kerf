// weft/persist: `state(init, { persist })` inside a defineState scope (research 14 §2.7). Phase 1 backends: local,
// session and memory (cookie and idb come with SSR). The weft() Vite plugin imports this where the option is used.
//
// Key `weft:<app>:<scope>.<box>`, envelope `{ v, at, data }`. On load: migrate[v] … migrate[current - 1], then the
// schema; any failure keeps `init` and moves the payload to `<key>:corrupt` (S003). Writes are coalesced to one per
// box per microtask and flushed on pagehide.

import { DEV, type Box, type StandardSchema, type StateOptions } from './index'
import { memoryStorage } from './memory'
import { StateError, features, report, type Instance, type StorageLike } from './scope'

type Options = Exclude<Exclude<StateOptions<unknown>['persist'], undefined>, string>
type Envelope = { v: number; at: number; data: unknown }
type Slot = { store: StorageLike; key: string; opts: Options }

const slots = new WeakMap<Box<any>, Slot>()
const pending = new Set<Box<any>>()

function backend(inst: Instance, where: string): StorageLike {
  if (where !== 'memory') {
    try {
      const s = where === 'local' ? localStorage : sessionStorage
      if (s) return s
    } catch {}
  }
  return (inst.app.storage ??= memoryStorage()) // no Web Storage (server, blocked storage): lives as long as the app
}

function options(scope: string, name: string, box: Box<any>): Options {
  const p = box.opts!.persist!
  const object = box.v !== null && typeof box.v === 'object'
  const o: Options = typeof p === 'string' ? { in: p } : p
  if (DEV) {
    if (o.in !== 'local' && o.in !== 'session' && o.in !== 'memory')
      throw new StateError('S008', `\`${scope}.${name}\` persists to '${o.in}', which Phase 1 doesn't have`, "use 'local', 'session' or 'memory' (cookie and idb come with SSR, Phase 3)")
    if (object && !o.schema)
      throw new StateError('S008', `\`${scope}.${name}\` persists an object or array without a schema`, `persist: { in: '${o.in}', schema: z.…(), version: 1 }`)
    if (o.migrate && o.version === undefined)
      throw new StateError('S003', `\`${scope}.${name}\` has migrations but no version`, 'add `version` (the current schema version)')
  }
  return o
}

function validate<T>(schema: StandardSchema<T>, value: unknown): { value: T } | string {
  const r: any = schema['~standard'].validate(value)
  if (r instanceof Promise) return 'the schema validates asynchronously; local and session read synchronously'
  return r.issues ? r.issues.map((i: { message: string }) => i.message).join('; ') : { value: r.value }
}

function load(inst: Instance, box: Box<any>, name: string) {
  const opts = options(inst.name, name, box)
  const store = backend(inst, opts.in)
  const key = `weft:${inst.app.name}:${inst.name}.${name}`
  slots.set(box, { store, key, opts })
  let raw: string | null = null
  try { raw = store.getItem(key) } catch {}
  if (raw === null) return
  const corrupt = (why: string) => {
    try { store.setItem(`${key}:corrupt`, raw!); store.removeItem(key) } catch {}
    if (DEV) report('S003', `the stored \`${inst.name}.${name}\` couldn't be read (${why}); using its initial value`, 'bump `version` and add `migrate[n]` when the schema changes')
  }
  let env: Envelope
  try { env = JSON.parse(raw) } catch { return corrupt('not JSON') }
  if (!env || typeof env.v !== 'number') return corrupt('no version envelope')
  const version = opts.version ?? 1
  if (env.v > version) return corrupt(`stored v${env.v} is newer than v${version}`)
  let data = env.data
  for (let v = env.v; v < version; v++) {
    const step = opts.migrate?.[v]
    if (!step) return corrupt(`stored v${env.v}, current v${version}, no migrate[${v}]`)
    try { data = step(data) } catch (e) { return corrupt(`migrate[${v}] threw: ${(e as Error).message}`) }
  }
  if (opts.schema) {
    const r = validate(opts.schema, data)
    if (typeof r === 'string') return corrupt(r)
    data = r.value
  } else if (typeof data !== typeof box.v) return corrupt(`expected a ${typeof box.v}`)
  box.v = data
}

/** Dev-only S010: the first value JSON would silently change (a Date, Map, class instance, function, NaN). */
function unserializable(v: unknown, path: string): string | void {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return
  if (typeof v === 'number') return Number.isFinite(v) ? undefined : `${path} is ${v}`
  if (typeof v !== 'object') return `${path} is a ${typeof v}`
  const proto = Object.getPrototypeOf(v)
  if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) return `${path} is a ${(v as object).constructor?.name ?? 'class instance'}`
  for (const [k, x] of Object.entries(v)) {
    const bad = unserializable(x, `${path}.${k}`)
    if (bad) return bad
  }
}

function flush() {
  for (const box of pending) {
    const { store, key, opts } = slots.get(box)!
    const bad = DEV && unserializable(box.v, box.n!)
    if (bad) { report('S010', `\`${box.n}\` can't be persisted: ${bad}`, 'store plain data (ids, numbers, strings), or drop `persist`'); continue }
    try { store.setItem(key, JSON.stringify({ v: opts.version ?? 1, at: Date.now(), data: box.v } satisfies Envelope)) }
    catch (e) { if (DEV) report('S008', `writing \`${box.n}\` failed: ${(e as Error).message}`, 'the storage is full or blocked; persist less') }
  }
  pending.clear()
}

let listening = false

features.persist = {
  load,
  write(_, box) {
    if (!pending.size) queueMicrotask(flush)
    pending.add(box)
    if (!listening && typeof addEventListener === 'function') {
      listening = true
      addEventListener('pagehide', flush)
    }
  },
}
