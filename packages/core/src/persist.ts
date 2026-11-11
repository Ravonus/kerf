// @kerf-js/core/persist: `state(init, { persist })` inside a defineState scope (research 14 §2.7, research 29 §2–3). Backends:
// local, session, cookie (the one a server can read) and memory (idb comes later). The kerf() Vite plugin imports this
// where the option is used.
//
// Key `kerf:<app>:<scope>.<box>`, envelope `{ v, at, data }`. On load: migrate[v] … migrate[current - 1], then the
// schema; any failure keeps `init` and moves the payload to `<key>:corrupt` (S003). Writes are coalesced to one per
// box per microtask and flushed on pagehide.
//
// A server renders `init` for local and session, so while hydrating those boxes stay at `init` and take the stored
// value once hydration ends; reading one in a server render is S013. A cookie is the same on both sides.

import { DEV, createRoot, onMount, type StandardSchema, type StateOptions } from './index'
import { rt } from './index/graph'
import { type Box } from './index/state'
import { keys } from './keys'
import { memoryStorage } from './memory'
import {
  StateError,
  features,
  report,
  unserializable,
  type Instance,
  type StorageLike,
} from './scope'

type Options = Exclude<Exclude<StateOptions<unknown>['persist'], undefined>, string>
type Envelope = { v: number; at: number; data: unknown }
type Slot = { store: StorageLike; key: string; opts: Options }

const slots = new WeakMap<Box<unknown>, Slot>()
const pending = new Set<Box<unknown>>()

/** A cookie's name for a key: `:` isn't a cookie-name character. */
const cookieName = (key: string) => key.replace(/:/g, '.')
const YEAR = 31_536_000

/** Reads and writes `document.cookie`; a server reads the request's cookies and writes nothing (research 29 §3). */
function cookies(inst: Instance, maxAge = YEAR): StorageLike {
  const jar = inst.app.cookies
  const write = (key: string, value: string, age: number) => {
    if (jar || key.endsWith(':corrupt')) return
    document.cookie = `${cookieName(key)}=${value}; Path=/; Max-Age=${age}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  }
  return {
    getItem(key) {
      const name = cookieName(key)
      const raw = jar
        ? jar.get(name)
        : document.cookie
            .split('; ')
            .find((c) => c.startsWith(`${name}=`))
            ?.slice(name.length + 1)
      return raw === undefined ? null : decodeURIComponent(raw)
    },
    setItem: (key, value) => write(key, encodeURIComponent(value), maxAge),
    removeItem: (key) => write(key, '', 0),
  }
}

function backend(inst: Instance, where: string, maxAge?: number): StorageLike {
  if (where === 'cookie') {
    if (inst.app.cookies || typeof document === 'object') return cookies(inst, maxAge)
  } else if (where !== 'memory' && !rt.server) {
    try {
      const s = where === 'local' ? localStorage : sessionStorage
      if (s) return s
    } catch {}
  }
  return (inst.app.storage ??= memoryStorage()) // no Web Storage (server, blocked storage): lives as long as the app
}

function options(scope: string, name: string, box: Box<unknown>): Options {
  const p = box.opts!.persist!
  const object = box.v !== null && typeof box.v === 'object'
  const o: Options = typeof p === 'string' ? { in: p } : p
  if (DEV) {
    if (o.in !== 'local' && o.in !== 'session' && o.in !== 'cookie' && o.in !== 'memory')
      throw new StateError(
        'S008',
        `\`${scope}.${name}\` persists to '${o.in as string}', which kerf doesn't have yet`,
        "use 'local', 'session', 'cookie' or 'memory'",
      )
    if (object && !o.schema)
      throw new StateError(
        'S008',
        `\`${scope}.${name}\` persists an object or array without a schema`,
        `persist: { in: '${o.in}', schema: z.…(), version: 1 }`,
      )
    if (o.migrate && o.version === undefined)
      throw new StateError(
        'S003',
        `\`${scope}.${name}\` has migrations but no version`,
        'add `version` (the current schema version)',
      )
  }
  return o
}

function validate<T>(schema: StandardSchema<T>, value: unknown): { value: T } | string {
  const r = schema['~standard'].validate(value)
  if (r instanceof Promise)
    return 'the schema validates asynchronously; local and session read synchronously'
  return r.issues ? r.issues.map((i) => i.message).join('; ') : { value: r.value }
}

function load(inst: Instance, box: Box<unknown>, name: string) {
  const opts = options(inst.name, name, box)
  const store = backend(inst, opts.in, opts.maxAge)
  const key = `kerf:${inst.app.name}:${inst.name}.${name}`
  slots.set(box, { store, key, opts })
  if (DEV && rt.server && (opts.in === 'local' || opts.in === 'session'))
    readsOnServer(box, `${inst.name}.${name}`, opts.in)
  let raw: string | null = null
  try {
    raw = store.getItem(key)
  } catch {}
  if (raw === null) return
  const corrupt = (why: string) => {
    try {
      store.setItem(`${key}:corrupt`, raw)
      store.removeItem(key)
    } catch {}
    if (DEV)
      report(
        'S003',
        `the stored \`${inst.name}.${name}\` couldn't be read (${why}); using its initial value`,
        'bump `version` and add `migrate[n]` when the schema changes',
      )
  }
  let env: Envelope
  try {
    env = JSON.parse(raw)
  } catch {
    return corrupt('not JSON')
  }
  if (!env || typeof env.v !== 'number') return corrupt('no version envelope')
  const version = opts.version ?? 1
  if (env.v > version) return corrupt(`stored v${env.v} is newer than v${version}`)
  let data = env.data
  for (let v = env.v; v < version; v++) {
    const step = opts.migrate?.[v]
    if (!step) return corrupt(`stored v${env.v}, current v${version}, no migrate[${v}]`)
    try {
      data = step(data as never)
    } catch (e) {
      return corrupt(`migrate[${v}] threw: ${(e as Error).message}`)
    }
  }
  if (opts.schema) {
    const r = validate(opts.schema, data)
    if (typeof r === 'string') return corrupt(r)
    data = r.value
  } else if (typeof data !== typeof box.v) return corrupt(`expected a ${typeof box.v}`)
  // The server rendered `init` for these. Storage already holds the value, so the late write skips the write hook.
  if (keys.hydrating && opts.in !== 'cookie')
    createRoot(
      () =>
        onMount(() => {
          const hook = box.h
          box.h = undefined
          box.w(data)
          box.h = hook
        }),
      null,
    )
  else box.v = data
}

/** Dev-only S013: the first read in a server render of a box the server can't see the stored value of. */
function readsOnServer(box: Box<unknown>, name: string, where: string) {
  const value = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), 'value')!
  let told = false
  Object.defineProperty(box, 'value', {
    get() {
      if (rt.server && !told) {
        told = true
        report(
          'S013',
          `\`${name}\` persists to '${where}', which a server can't read: the page shows its initial value, then flashes to the stored one`,
          "`persist: { in: 'cookie' }` if it's small, or render it client-only",
        )
      }
      return value.get!.call(box)
    },
    set(v) {
      value.set!.call(box, v)
    },
  })
}

/** Dev-only S008: the bytes this app's cookies take; a browser drops a cookie over 4 KB without a word. */
const COOKIE_BUDGET = 3072
const cookieBytes = () =>
  document.cookie
    .split('; ')
    .filter((c) => c.startsWith('kerf.'))
    .reduce((n, c) => n + c.length, 0)

function flush() {
  for (const box of pending) {
    const { store, key, opts } = slots.get(box)!
    const bad = DEV && unserializable(box.v, box.n!)
    if (bad) {
      report(
        'S010',
        `\`${box.n}\` can't be persisted: ${bad}`,
        'store plain data (ids, numbers, strings), or drop `persist`',
      )
      continue
    }
    try {
      store.setItem(
        key,
        JSON.stringify({ v: opts.version ?? 1, at: Date.now(), data: box.v } satisfies Envelope),
      )
    } catch (e) {
      if (DEV)
        report(
          'S008',
          `writing \`${box.n}\` failed: ${(e as Error).message}`,
          'the storage is full or blocked; persist less',
        )
    }
    if (DEV && opts.in === 'cookie' && cookieBytes() > COOKIE_BUDGET)
      report(
        'S008',
        `this app's cookies take ${cookieBytes()} bytes, over the 3 KB budget`,
        "move the big box to `persist: 'local'`",
      )
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
