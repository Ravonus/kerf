// weft app state: defineState (PLAN §4.5, research 14 §2). Phase 1: client instances, names, $reset, $snapshot.
// History (weft/history, which also owns action transactions) and persistence (weft/persist) are separate modules
// that register here; the weft() Vite plugin imports each one into the modules that use its option, so an app that
// uses neither ships neither. Diagnostic text, dev names and the S004/S010 checks are dev-only.
//
// A scope is a named setup function over ordinary boxes. It runs once per app instance, lazily, on first access.
// Functions it returns are actions: each call is one transaction (one undo step), and nested calls join the outer.

import { Box, DEV, Memo, collect, context, createRoot, untrack, type Derived, type State } from './index'

// ---- diagnostics ------------------------------------------------------------------------------------------------

export class StateError extends Error {
  constructor(public code: string, message: string, fix: string) {
    super(`${code}: ${message}\n  fix: ${fix}`)
  }
}

/** Dev-only: callers write `if (DEV) report(…)` so the text is stripped from production builds. */
export const report = (code: string, message: string, fix: string) => console.error(new StateError(code, message, fix).message)

// ---- app instances ----------------------------------------------------------------------------------------------

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface AppOptions {
  /** Persistence key prefix: `weft:<name>:<scope>.<box>`. */
  name?: string
  /** Seed values by scope and returned key, applied before setup returns (the SSR hydration path). */
  state?: Record<string, Record<string, unknown>>
  /** Backing store for `persist: 'memory'` (tests share one across `reload`). */
  storage?: StorageLike
}

export interface App {
  name: string
  seed: Record<string, Record<string, unknown>>
  storage?: StorageLike
  instances: Map<ScopeDef, Instance>
}

export function createApp(options: AppOptions = {}): App {
  return { name: options.name ?? 'app', seed: options.state ?? {}, storage: options.storage, instances: new Map() }
}

/**
 * Which app a handle means: the one its owner was rendered in, else the current one. The client has one app per tab;
 * `weft/test` makes a fresh one per `render()`, and weft/ssr one per render pass (one request, never shared).
 */
let current: App = createApp()
const appContext = context<App | undefined>(undefined)
const resolve = () => appContext.use ?? current

export function useApp(app: App) {
  const prev = current
  current = app
  return prev
}

/** Run `fn` (a render) with `app` as the owner's app, so its bindings keep reading that app's scopes. */
export function withApp<T>(app: App, fn: () => T): T {
  return appContext.provide(app, fn)
}

/** End an app: dispose every scope instance's owner (weft/test, when a render unmounts). */
export function disposeApp(app: App) {
  for (const inst of app.instances.values()) inst.dispose()
  app.instances.clear()
}

// ---- features: weft/history and weft/persist register here -------------------------------------------------------

export interface Timeline {
  clear(): void
}

export const features: {
  history?: {
    /** A scope's log. */
    create(inst: Instance, limit: number): Timeline
    /** Wraps a returned function: one transaction per call, nested calls join the outer. */
    action<F extends Fn>(name: string, fn: F): F
    /** A write to a box in a scope with history. */
    record(inst: Instance, box: Box<any>, before: unknown): void
    /** Write without recording (undo, redo, reset). */
    replay(fn: () => void): void
  }
  persist?: { load(inst: Instance, box: Box<any>, name: string): void; write(inst: Instance, box: Box<any>): void }
} = {}

function onWrite(box: Box<any>, before: unknown) {
  const inst = owners.get(box)!
  if (inst.history) features.history!.record(inst, box, before)
  if (box.opts?.persist) features.persist!.write(inst, box)
}

// ---- scopes -----------------------------------------------------------------------------------------------------

type Fn = (...args: any[]) => any
type ScopeShape = Record<string, State<any> | Derived<any> | Fn | unknown>

export interface HistoryEntry { action: string; at: number }

export interface History {
  undo(): void
  redo(): void
  clear(): void
  readonly canUndo: Derived<boolean>
  readonly canRedo: Derived<boolean>
  readonly entries: Derived<readonly HistoryEntry[]>
}

export type ScopeHandle<N extends string, T> = T & {
  readonly $name: N
  /** Every box back to its initial value; persisted boxes rewritten; history cleared. */
  $reset(): void
  /** A frozen plain copy of the returned boxes and derived values (devtools, bug reports). */
  $snapshot(): Readonly<{ [K in keyof T]: T[K] extends Derived<infer V> ? V : never }>
  $history: History
}

interface ScopeDef {
  name: string
  setup: () => ScopeShape
  options: { history?: { limit: number } }
  /** Dev: the handle, returned again when a hot update re-runs the defining module. */
  h?: unknown
}

/** Set by weft/hmr: a second `defineState` with a known name is a module re-run, not a duplicate. */
export const hmr = { on: false }

const defs = new Map<string, ScopeDef>()
export const owners = new WeakMap<Box<any>, Instance>()
const building = new Set<ScopeDef>()

export class Instance {
  api: Record<string, unknown> = {}
  boxes: Box<any>[]
  inits = new Map<Box<any>, unknown>()
  history?: Timeline
  name: string
  /** Disposes the setup's owner: its watchers and the browser values it reads (`disposeApp`). */
  dispose!: () => void

  constructor(public app: App, def: ScopeDef) {
    this.name = def.name
    if (def.options.history) {
      if (DEV && !features.history)
        throw new StateError('S009', `\`${def.name}\` sets \`history\`, but weft/history isn't loaded`, "the weft() Vite plugin adds it; without the plugin, `import 'weft/history'`")
      this.history = features.history!.create(this, def.options.history.limit)
    }
    const [shape, boxes] = collect(() => createRoot(d => ((this.dispose = d), def.setup()), null))
    this.boxes = boxes

    const named = new Map<Box<any>, string>()
    let writable = 0, actions = 0
    for (const [key, v] of Object.entries(shape)) {
      if (DEV && key[0] === '$') throw new StateError('S009', `\`${def.name}\` returns \`${key}\`; $-names are reserved`, `rename \`${key}\``)
      if (v instanceof Box) { named.set(v, key); if (DEV) writable++ }
      // Actions are transactions only where weft/history is loaded; otherwise an action is the function itself.
      if (typeof v === 'function') { if (DEV) actions++; this.api[key] = features.history ? features.history.action(`${def.name}.${key}`, v as Fn) : v }
      else this.api[key] = v
    }
    if (DEV && (writable > 12 || actions > 15))
      report('S004', `\`${def.name}\` has ${writable} writable boxes and ${actions} actions`, 'split it by feature: one scope per feature file')

    const seed = app.seed[def.name] ?? {}
    for (const box of boxes) {
      const name = box.opts?.name ?? named.get(box)
      if (DEV) box.n = `${def.name}.${name ?? '#'}`
      this.inits.set(box, box.v)
      owners.set(box, this)
      if (box.opts?.persist) {
        if (DEV && !features.persist)
          throw new StateError('S008', `\`${def.name}\` persists a box, but weft/persist isn't loaded`, "the weft() Vite plugin adds it; without the plugin, `import 'weft/persist'`")
        if (DEV && !name) throw new StateError('S008', `\`${def.name}\` persists a box it doesn't return or name`, "return it from the setup, or give it `name: '…'`")
        features.persist!.load(this, box, name!)
      }
      if (name && name in seed) box.v = seed[name] // before setup returns: nothing has read it yet
      box.h = onWrite
    }
  }

  reset() {
    const run = () => { for (const box of this.boxes) box.w(this.inits.get(box)) }
    features.history ? features.history.replay(run) : run()
    this.history?.clear()
  }

  snapshot() {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(this.api)) if (v instanceof Box || v instanceof Memo) out[k] = untrack(() => v.value)
    return deepFreeze(structuredClone(out))
  }
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.freeze(v)
    for (const x of Object.values(v)) deepFreeze(x)
  }
  return v
}

function instance(def: ScopeDef, app = resolve()): Instance {
  let inst = app.instances.get(def)
  if (inst) return inst
  if (DEV && building.has(def))
    throw new StateError('S009', `\`${def.name}\`'s setup reads \`${def.name}\` (a setup cycle)`, 'move the shared part into a third scope, or read it inside a `derived` or action')
  if (DEV) building.add(def)
  const prev = useApp(app) // a setup that reads another scope reads it in the same app
  try { inst = new Instance(app, def) } finally { if (DEV) building.delete(def); useApp(prev) }
  app.instances.set(def, inst)
  return inst
}

/**
 * A named scope of shared client state (PLAN §4.5). `setup` runs once per app instance, on first access, and
 * returns boxes, derived values and actions:
 *
 *   export const cart = defineState('cart', () => {
 *     const lines = state<Record<string, number>>({}, { persist: { in: 'local', schema, version: 1 } })
 *     return { lines, add(id: string) { lines.set(d => { d[id] = (d[id] ?? 0) + 1 }) } }
 *   }, { history: { limit: 100 } })
 */
export function defineState<N extends string, T extends ScopeShape>(
  name: N,
  setup: () => T,
  options: { history?: { limit: number } } = {},
): ScopeHandle<N, T> {
  const had = DEV && defs.get(name)
  if (had) {
    if (!hmr.on) throw new StateError('S009', `two scopes are named '${name}'`, 'scope names are unique per app; rename one')
    // A hot update re-ran the module: keep the scope and its live state; new apps (and the next reload) get the edit.
    had.setup = setup
    had.options = options
    return had.h as ScopeHandle<N, T>
  }
  const def: ScopeDef = { name, setup, options }
  if (DEV) defs.set(name, def) // duplicates (S009), hot updates and scope(); all dev-only
  const meta: Record<string, unknown> = {
    $name: name,
    $reset: () => instance(def).reset(),
    $snapshot: () => instance(def).snapshot(),
  }
  const api = () => instance(def).api
  const handle = new Proxy({} as ScopeHandle<N, T>, {
    get(_, key) {
      if (typeof key !== 'string') return undefined
      if (key in meta) return meta[key]
      if (key === '$history') {
        const h = instance(def).history as History | undefined
        if (DEV && !h) throw new StateError('S009', `\`${name}\` has no history`, `defineState('${name}', setup, { history: { limit: 100 } })`)
        return h
      }
      return api()[key]
    },
    has: (_, key) => key in meta || key in api(),
  })
  if (DEV) def.h = handle
  return handle
}

/** Instantiate one scope in its own app, with no UI (unit tests). */
export function scope<H extends { readonly $name: string }>(handle: H, options: AppOptions = {}): H {
  const app = createApp(options)
  instance(defs.get(handle.$name)!, app)
  // A fresh target: the handle's own descriptor traps would resolve the default app (Proxy invariant checks).
  return new Proxy({} as H, {
    get(_, key) {
      const prev = useApp(app)
      try {
        const v = (handle as any)[key]
        if (typeof v !== 'function') return v
        const run = (...a: unknown[]) => { const p = useApp(app); try { return v(...a) } finally { useApp(p) } }
        return Object.defineProperty(run, 'name', { value: v.name })
      } finally { useApp(prev) }
    },
  })
}
