// @kerf/core/sync: `state(init, { persist, sync: 'tabs' })` in a defineState scope (research 14 §2.8, research 32 §1). One
// BroadcastChannel per app; the kerf() Vite plugin imports this where the option is used.
//
// A write goes out as the top-level keys that changed, for a plain object, else as the whole value, coalesced per
// microtask. Conflicts are last writer wins per key by `(at, tab)`, so two tabs adding different products merge. An
// incoming write skips the write hook (no echo, no undo step), then asks `persist` to store the merged value: the other
// tab's copy doesn't hold this tab's keys. The merged value must pass the box's schema, because a tab can be an older
// deploy. New tabs read `persist`, so a box without it, or in `session`, can't sync (S008).

import { DEV, type StandardSchema } from './index'
import { type Box } from './index/state'
import { StateError, features, report, type Instance } from './scope'

/** `s`: scope.box. `a`: stamps. `p`: key → value, `d`: keys gone; or `v`: the whole value. */
type Patch = {
  s: string
  at: number
  t: string
  p?: Record<string, unknown>
  d?: string[]
  v?: unknown
  w?: 1
}
interface Slot {
  inst: Instance
  box: Box<unknown>
  id: string
  sent: unknown
  stamps: Map<string, [number, string]>
  schema?: StandardSchema<unknown> | undefined
}
interface Line {
  bc: BroadcastChannel
  slots: Map<string, Slot>
  refs: number
  tab: string
  dirty: Set<Slot>
}

const lines = new WeakMap<object, Line>()
const slots = new WeakMap<Box<unknown>, Slot>()

const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype
const newer = (a: [number, string], b?: [number, string]) =>
  !b || a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])
const WHOLE = ''

function line(inst: Instance): Line | undefined {
  let l = lines.get(inst.app)
  if (l || typeof BroadcastChannel === 'undefined') return l
  const made: Line = {
    bc: new BroadcastChannel(`kerf:state:${inst.app.name}`),
    slots: new Map(),
    refs: 0,
    tab: crypto.getRandomValues(new Uint32Array(2)).join('.'),
    /* randomUUID is missing on plain http */ dirty: new Set(),
  }
  made.bc.onmessage = (e) => receive(made, e.data)
  lines.set(inst.app, (l = made))
  return l
}

function accepted(s: Slot, v: unknown): { value: unknown } | undefined {
  if (!s.schema) return typeof v === typeof s.box.v ? { value: v } : undefined
  const r = s.schema['~standard'].validate(v)
  return r instanceof Promise || r.issues ? undefined : { value: r.value }
}

function receive(l: Line, m: Patch) {
  const s = l.slots.get(m?.s)
  if (!s || typeof m.at !== 'number') return
  const stamp: [number, string] = [m.at, m.t]
  let next: unknown
  if (m.w) {
    if (!newer(stamp, s.stamps.get(WHOLE))) return
    s.stamps.clear()
    s.stamps.set(WHOLE, stamp)
    next = m.v
  } else {
    const base: Record<string, unknown> = plain(s.box.v) ? { ...s.box.v } : {}
    for (const k of [...Object.keys(m.p ?? {}), ...(m.d ?? [])]) {
      if (k === '__proto__' || !newer(stamp, s.stamps.get(k) ?? s.stamps.get(WHOLE))) continue
      s.stamps.set(k, stamp)
      if (m.d?.includes(k)) delete base[k]
      else base[k] = m.p![k]
    }
    next = base
  }
  const ok = accepted(s, next)
  if (!ok) {
    if (DEV)
      report(
        'S008',
        `\`${s.id}\` dropped a write from another tab that its schema refuses`,
        'bump `version` when the schema changes: that tab runs an older deploy',
      )
    return
  }
  const hook = s.box.h
  s.box.h = undefined
  s.box.w(ok.value)
  s.box.h = hook
  s.sent = s.box.v
  if (s.box.opts?.persist) features.persist!.write(s.inst, s.box)
}

function flush(l: Line) {
  const now = Date.now()
  for (const s of l.dirty) {
    const was = s.sent,
      v = s.box.v
    s.sent = v
    if (Object.is(was, v)) continue
    const m: Patch = { s: s.id, at: now, t: l.tab }
    if (plain(was) && plain(v)) {
      m.p = {}
      m.d = Object.keys(was).filter((k) => !(k in v))
      for (const k of Object.keys(v)) if (!Object.is(was[k], v[k])) m.p[k] = v[k]
      for (const k of [...Object.keys(m.p), ...m.d]) s.stamps.set(k, [now, l.tab])
    } else {
      m.w = 1
      m.v = v
      s.stamps.clear()
      s.stamps.set(WHOLE, [now, l.tab])
    }
    l.bc.postMessage(m)
  }
  l.dirty.clear()
}

features.sync = {
  attach(inst, box, name) {
    const id = `${inst.name}.${name}`
    const o = box.opts!
    const where = typeof o.persist === 'string' ? o.persist : o.persist?.in
    if (DEV && (!where || where === 'session'))
      throw new StateError(
        'S008',
        `\`${id}\` has \`sync: 'tabs'\` ${where ? 'and persists to `session`, which is per tab' : 'without `persist`'}: a new tab would start from nothing`,
        "`persist: { in: 'local', … }`",
      )
    const l = line(inst)
    if (!l) return
    const s: Slot = {
      inst,
      box,
      id,
      sent: box.v,
      stamps: new Map(),
      schema: typeof o.persist === 'object' ? o.persist.schema : undefined,
    }
    slots.set(box, s)
    l.slots.set(id, s)
    l.refs++
    const dispose = inst.dispose
    inst.dispose = () => {
      dispose()
      l.slots.delete(id)
      if (!--l.refs) {
        l.bc.close()
        lines.delete(inst.app)
      }
    }
  },
  write(inst, box) {
    const s = slots.get(box)
    const l = lines.get(inst.app)
    if (!s || !l) return
    if (!l.dirty.size) queueMicrotask(() => flush(l))
    l.dirty.add(s)
  },
}
