// weft app state: defineState (PLAN §4.5, research 14 §2). Phase 1: client instances, names, $reset, $snapshot.
// History (@weft-js/core/history, which also owns action transactions) and persistence (@weft-js/core/persist) are separate modules
// that register here; the weft() Vite plugin imports each one into the modules that use its option, so an app that
// uses neither ships neither. Diagnostic text, dev names and the S004/S010 checks are dev-only.
//
// A scope is a named setup function over ordinary boxes. It runs once per app instance, lazily, on first access.
// Functions it returns are actions: each call is one transaction (one undo step), and nested calls join the outer.

// oxlint-disable-next-line import/no-cycle -- this file builds on the core, and the `weft` entry re-exports it
import { Box, DEV, Memo, collect, context, createRoot, named as graph, rt, untrack, type Derived } from './index'

// ---- diagnostics ------------------------------------------------------------------------------------------------

/** A misuse of state, with its code and how to fix it. */
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
  /** The request's cookies, for `persist: 'cookie'` on the server: by name, as the `Cookie` header sends them. */
  cookies?: { get(name: string): string | undefined }
}

export interface App {
  name: string
  seed: Record<string, Record<string, unknown>>
  storage?: StorageLike | undefined
  cookies?: AppOptions['cookies'] | undefined
  instances: Map<ScopeDef, Instance>
}

export function createApp(options: AppOptions = {}): App {
  return { name: options.name ?? 'app', seed: options.state ?? {}, storage: options.storage, cookies: options.cookies, instances: new Map() }
}

/**
 * Which app a handle means: the one its owner was rendered in, else the current one. The client has one app per tab;
 * `@weft-js/core/test` makes a fresh one per `render()`, and @weft-js/core/ssr one per render pass (one request, never shared).
 */
let current: App = createApp()
const root = current
const appContext = context<App | undefined>(undefined)
function resolve() {
  const app = appContext.use ?? current
  // A server has no "the tab's app": this app would be shared by every request. Production too: it's a leak.
  if (rt.isolated && app === root)
    throw new StateError('S002', DEV ? 'a defineState scope was reached on the server outside a render (module scope, `load`, a server function, a timer): its value would be shared by every request' : 'scope outside a render', 'read it in a component, a handler or a `derived`; pass values into server code as arguments')
  return app
}

export function useApp(app: App) {
  const prev = current
  current = app
  return prev
}

/** Run `fn` (a render) with `app` as the owner's app, so its bindings keep reading that app's scopes. */
export function withApp<T>(app: App, fn: () => T): T {
  return appContext.provide(app, fn)
}

/** End an app: dispose every scope instance's owner (@weft-js/core/test, when a render unmounts). */
export function disposeApp(app: App) {
  for (const inst of app.instances.values()) inst.dispose()
  app.instances.clear()
}

// ---- features: @weft-js/core/history and @weft-js/core/persist register here -------------------------------------------------------

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
    record(inst: Instance, box: Box<unknown>, before: unknown): void
    /** Write without recording (undo, redo, reset). */
    replay(fn: () => void): void
  }
  persist?: { load(inst: Instance, box: Box<unknown>, name: string): void; write(inst: Instance, box: Box<unknown>): void }
  sync?: { attach(inst: Instance, box: Box<unknown>, name: string): void; write(inst: Instance, box: Box<unknown>): void }
} = {}

function onWrite(box: Box<unknown>, before: unknown) {
  const inst = owners.get(box)!
  if (inst.history) features.history!.record(inst, box, before)
  if (box.opts?.persist) features.persist!.write(inst, box)
  if (box.opts?.sync) features.sync!.write(inst, box)
}

// ---- scopes -----------------------------------------------------------------------------------------------------

type Fn = (...args: never[]) => unknown
type ScopeShape = Record<string, unknown>

/** One step of a scope's undo history: what happened, and when. */
export interface HistoryEntry { action: string; at: number }

/** A scope's undo log. */
export interface History {
  undo(): void
  redo(): void
  clear(): void
  readonly canUndo: Derived<boolean>
  readonly canRedo: Derived<boolean>
  readonly entries: Derived<readonly HistoryEntry[]>
}

/** What `defineState` returns: the setup's values, and the scope's name, reset and history. */
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

/** Set by @weft-js/core/hmr: a second `defineState` with a known name is a module re-run, not a duplicate. */
export const hmr = { on: false }

const defs = new Map<string, ScopeDef>()
export const owners = new WeakMap<Box<unknown>, Instance>()
const building = new Set<ScopeDef>()

export class Instance {
  api: Record<string, unknown> = {}
  boxes: Box<unknown>[]
  inits = new Map<Box<unknown>, unknown>()
  history?: Timeline
  name: string
  /** Disposes the setup's owner: its watchers and the browser values it reads (`disposeApp`). */
  dispose!: () => void

  constructor(public app: App, def: ScopeDef) {
    this.name = def.name
    if (def.options.history) {
      if (DEV && !features.history)
        throw new StateError('S009', `\`${def.name}\` sets \`history\`, but @weft-js/core/history isn't loaded`, "the weft() Vite plugin adds it; without the plugin, `import '@weft-js/core/history'`")
      this.history = features.history!.create(this, def.options.history.limit)
    }
    const [shape, boxes] = collect(() => createRoot(d => ((this.dispose = d), def.setup()), null))
    this.boxes = boxes

    const named = new Map<Box<unknown>, string>()
    let writable = 0, actions = 0
    for (const [key, v] of Object.entries(shape)) {
      if (DEV && key[0] === '$') throw new StateError('S009', `\`${def.name}\` returns \`${key}\`; $-names are reserved`, `rename \`${key}\``)
      if (v instanceof Box) { named.set(v, key); if (DEV) writable++ }
      // Actions are transactions only where @weft-js/core/history is loaded; otherwise an action is the function itself.
      if (typeof v === 'function') { if (DEV) actions++; this.api[key] = features.history ? features.history.action(`${def.name}.${key}`, v as Fn) : v }
      else this.api[key] = v
    }
    if (DEV && (writable > 12 || actions > 15))
      report('S004', `\`${def.name}\` has ${writable} writable boxes and ${actions} actions`, 'split it by feature: one scope per feature file')

    const seed = app.seed[def.name] ?? rt.state?.[def.name] ?? {}
    if (rt.state) delete rt.state[def.name]
    for (const box of boxes) {
      const name = box.opts?.name ?? named.get(box)
      if (DEV) box.n = `${def.name}.${name ?? '#'}`
      this.inits.set(box, box.v)
      owners.set(box, this)
      if (box.opts?.persist) {
        if (DEV && !features.persist)
          throw new StateError('S008', `\`${def.name}\` persists a box, but @weft-js/core/persist isn't loaded`, "the weft() Vite plugin adds it; without the plugin, `import '@weft-js/core/persist'`")
        if (DEV && !name) throw new StateError('S008', `\`${def.name}\` persists a box it doesn't return or name`, "return it from the setup, or give it `name: '…'`")
        features.persist!.load(this, box, name!)
      }
      if (name && name in seed) box.v = seed[name] // before setup returns: nothing has read it yet
      if (box.opts?.sync) {
        if (DEV && !features.sync) throw new StateError('S008', `\`${def.name}\` syncs a box, but @weft-js/core/sync isn't loaded`, "the weft() Vite plugin adds it; without the plugin, `import '@weft-js/core/sync'`")
        if (DEV && !name) throw new StateError('S008', `\`${def.name}\` syncs a box it doesn't return or name`, "return it from the setup, or give it `name: '…'`")
        features.sync!.attach(this, box, name!)
      }
      box.h = onWrite
    }
    if (DEV) {
      // The dev graph (@weft-js/core/devtools): the scope's boxes and returned derived values, until the app ends.
      const nodes: (Box<unknown> | Memo<unknown>['node'])[] = [...boxes]
      for (const [key, v] of Object.entries(this.api)) if (v instanceof Memo) { v.node.n = `${def.name}.${key}`; nodes.push(v.node) }
      for (const n of nodes) graph.add(n)
      const dispose = this.dispose
      this.dispose = () => { for (const n of nodes) graph.delete(n); dispose() }
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

/** Dev-only S010: the first value JSON would silently change (a Date, Map, class instance, function, NaN). */
export function unserializable(v: unknown, path: string): string | void {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return
  if (typeof v === 'number') return Number.isFinite(v) ? undefined : `${path} is ${v}`
  if (typeof v !== 'object') return `${path} is a ${typeof v}`
  const proto = Object.getPrototypeOf(v)
  if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) return `${path} is a ${(v).constructor?.name ?? 'class instance'}`
  for (const [k, x] of Object.entries(v)) {
    const bad = unserializable(x, `${path}.${k}`)
    if (bad) return bad
  }
}

/**
 * The state payload (research 29 §2): each scope's named boxes that differ from `init`. Unnamed boxes are private to
 * their setup, and the setup's own resources own some. Query values aren't boxes here: they travel in the query cache.
 */
export function dehydrate(app: App): Record<string, Record<string, unknown>> | undefined {
  let out: Record<string, Record<string, unknown>> | undefined
  for (const inst of app.instances.values()) {
    for (const box of inst.boxes) {
      const init = inst.inits.get(box)
      if (Object.is(box.v, init)) continue
      const name = box.opts?.name ?? Object.keys(inst.api).find(k => inst.api[k] === box)
      if (!name) continue
      const bad = DEV && unserializable(box.v, `${inst.name}.${name}`)
      if (bad) { report('S010', `\`${inst.name}.${name}\` can't go in the page: ${bad}`, 'keep plain data in it (ids, numbers, strings)'); continue }
      if (JSON.stringify(box.v) === JSON.stringify(init)) continue
      ;((out ??= {})[inst.name] ??= {})[name] = box.v
    }
  }
  return out
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
        const v = (handle as Record<PropertyKey, unknown>)[key]
        if (typeof v !== 'function') return v
        const run = (...a: unknown[]) => { const p = useApp(app); try { return v(...a) } finally { useApp(p) } }
        return Object.defineProperty(run, 'name', { value: v.name })
      } finally { useApp(prev) }
    },
  })
}
