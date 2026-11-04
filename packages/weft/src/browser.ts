// @weft-js/core/browser: browser events as reactive values (PLAN §4.2, research 07 §6): `online`, `visible`, `lifecycle`,
// `media`, `on`, `interval` and `tabs.channel` (research 32); `storage` is `state(…, { persist })` inside `defineState`
// (§4.5).
//
// Each value is created in setup and subscribes on its first read: one listener per (target, type) per document,
// shared by every reader and refcounted, and released when the reader's owner is disposed. On the server (and
// during hydration) a value is its declared `ssr` value and touches no browser global; hydrated readers switch to
// the real value in the first flush after hydration. Outside an owner these throw in dev (W051).

import {
  Box,
  DEV,
  collect,
  devComponent,
  getOwner,
  onCleanup,
  rt,
  type Derived,
  type StandardSchema,
} from './index'
import { keys } from './keys'

type Handler = (e: Event) => void
type Handlers = Set<Handler> & { h?: Handler }

const targets = new WeakMap<EventTarget, Map<string, Handlers>>()

/** Dev only: what is open right now and how to close it, for @weft-js/core/test's leak check (T012). */
export const open = new Map<object, [what: string, close: () => void]>()

const where = () => (devComponent.label ? ` in ${devComponent.label}` : '')

/** One native listener per (target, type), dispatching to every handler added through it. */
function listen(target: EventTarget, type: string, fn: Handler, what?: string): () => void {
  let types = targets.get(target)
  if (!types) targets.set(target, (types = new Map()))
  let fns = types.get(type)
  if (!fns) {
    const set: Handlers = (fns = new Set())
    // a snapshot: a handler can remove itself while this runs
    set.h = (e) => {
      for (const f of [...set]) f(e)
    }
    types.set(type, set)
    target.addEventListener(type, set.h)
  }
  const f: Handler = (e) => fn(e)
  fns.add(f)
  const stop = () => {
    if (!fns.delete(f)) return
    if (DEV) open.delete(f)
    if (!fns.size) {
      target.removeEventListener(type, fns.h!)
      types.delete(type)
    }
  }
  if (DEV && what) open.set(f, [what, stop])
  return stop
}

const server = () => rt.server || typeof window === 'undefined'

function owned(what: string) {
  if (DEV && !getOwner())
    throw new Error(
      `W051: \`${what}\` was created outside an owner (module scope, after \`await\`, or in a timer or handler), so nothing removes it.\n  fix: create it in a component's setup, or inside \`createRoot(dispose => …)\` and call \`dispose\``,
    )
}

/** A box no defineState setup collects (a setup can create browser values). */
const box = <T>(v: T) => collect(() => new Box(v))[0]

/** A shared source: one box, the listeners that update it while anything reads it. */
interface Shared<T> {
  b?: Box<T>
  refs: number
  /** Subscribe; `update` re-reads the value. Returns the unsubscribe. */
  on(update: () => void): () => void
  get(): T
  off?: (() => void) | undefined
}

const shared = <T>(get: () => T, sub: (update: () => void) => () => void): Shared<T> => ({
  refs: 0,
  get,
  on: sub,
})

function acquire<T>(s: Shared<T>) {
  if (s.refs++) return
  const b = (s.b ??= box(undefined as T))
  s.off = s.on(() => (b.value = s.get()))
  b.v = s.get() // no reader is subscribed yet, so nothing to notify
}

function release<T>(s: Shared<T>) {
  if (--s.refs) return
  s.off!()
  s.off = undefined
}

function reader<T>(name: string, src: () => Shared<T>, ssr: T): Derived<T> {
  if (server()) return { value: ssr }
  owned(`${name}()`)
  const token = {},
    what = DEV ? `${name}()${where()}` : ''
  let s: Shared<T> | undefined,
    held = false
  // Hydrating: render what the server rendered, then the real value in the next flush.
  const h = keys.hydrating ? box(true) : undefined
  if (h) queueMicrotask(() => (h.value = false))
  const drop = () => {
    if (!held) return
    held = false
    release(s!)
    if (DEV) open.delete(token)
  }
  onCleanup(drop)
  return {
    get value() {
      if (h?.value) return ssr
      if (!s) {
        acquire((s = src()))
        held = true
        if (DEV) open.set(token, [what, drop])
      }
      return s.b!.value
    },
  }
}

const all = (offs: (() => void)[]) => () => offs.forEach((f) => f())

let onlineSrc: Shared<boolean> | undefined
/** `navigator.onLine`: `true` means "a network", not "the server". On the server: `ssr` (default `true`). */
export function online(options: { ssr?: boolean } = {}): Derived<boolean> {
  return reader(
    'online',
    () =>
      (onlineSrc ??= shared(
        () => navigator.onLine,
        (u) => all([listen(window, 'online', u), listen(window, 'offline', u)]),
      )),
    options.ssr ?? true,
  )
}

let visibleSrc: Shared<boolean> | undefined
/** Whether the page is visible (`document.visibilityState`). On the server: `ssr` (default `true`). */
export function visible(options: { ssr?: boolean } = {}): Derived<boolean> {
  // oxlint-disable-next-line eqeqeq -- two strings; the extra character is a byte in every page's runtime
  return reader(
    'visible',
    () =>
      (visibleSrc ??= shared(
        () => document.visibilityState != 'hidden',
        (u) => listen(document, 'visibilitychange', u),
      )),
    options.ssr ?? true,
  )
}

/** The page's state in the browser's lifecycle: seen and focused, seen, hidden, frozen, or going away. */
export type Lifecycle = 'active' | 'passive' | 'hidden' | 'frozen' | 'terminated'

let lifecycleSrc: Shared<Lifecycle> | undefined
/**
 * The Page Lifecycle state: `active` (visible and focused), `passive` (visible, not focused), `hidden`, `frozen`
 * (`freeze`, or kept in the back/forward cache) and `terminated` (unloading). From `visibilitychange`, `focus`/`blur`,
 * `freeze`/`resume` and `pagehide`/`pageshow`; never `unload`. On the server: `ssr` (default `'active'`).
 */
export function lifecycle(options: { ssr?: Lifecycle } = {}): Derived<Lifecycle> {
  return reader(
    'lifecycle',
    () => {
      if (lifecycleSrc) return lifecycleSrc
      let gone: Lifecycle | undefined // frozen or terminated: events say so, nothing can be asked
      return (lifecycleSrc = shared(
        // oxlint-disable-next-line eqeqeq -- two strings; the extra character is a byte in every page's runtime
        () =>
          gone ??
          (document.visibilityState == 'hidden'
            ? 'hidden'
            : document.hasFocus()
              ? 'active'
              : 'passive'),
        (u) => {
          gone = undefined
          const set = (to?: Lifecycle) => () => {
            gone = to
            u()
          }
          return all([
            listen(document, 'visibilitychange', u),
            listen(window, 'focus', u),
            listen(window, 'blur', u),
            listen(document, 'freeze', set('frozen')),
            listen(document, 'resume', set()),
            listen(window, 'pagehide', (e) =>
              set((e as PageTransitionEvent).persisted ? 'frozen' : 'terminated')(),
            ),
            listen(window, 'pageshow', set()),
          ])
        },
      ))
    },
    options.ssr ?? 'active',
  )
}

const queries = new Map<string, Shared<boolean>>()
/**
 * `matchMedia(query).matches`. `ssr` is what the server renders (it can't know the screen); a component that is
 * server-rendered must pass it (W054). Without it the server renders `false` and dev builds warn.
 */
export function media(query: string, options: { ssr?: boolean } = {}): Derived<boolean> {
  if (DEV && options.ssr === undefined && server())
    console.warn(
      `W054: media('${query}') is read on the server without \`ssr\`; rendering false, which may not match the client.\n  fix: media('${query}', { ssr: false })`,
    )
  return reader(
    'media',
    () => {
      let s = queries.get(query)
      if (!s) {
        let list: MediaQueryList
        queries.set(
          query,
          (s = shared(
            () => list.matches,
            (u) => listen((list = matchMedia(query)), 'change', u),
          )),
        )
      }
      return s
    },
    options.ssr ?? false,
  )
}

type EventsOf<T> = T extends Window
  ? WindowEventMap
  : T extends Document
    ? DocumentEventMap
    : T extends HTMLElement
      ? HTMLElementEventMap
      : T extends SVGElement
        ? SVGElementEventMap
        : T extends MediaQueryList
          ? MediaQueryListEventMap
          : Record<string, Event>

/**
 * Listen to `type` on `target` until the owner is disposed (`e` is typed from the target's event map). Handlers on
 * one (target, type) share one native listener; passing `options` gives this one its own. Returns a stop function.
 */
export function on<T extends EventTarget, K extends keyof EventsOf<T> & string>(
  target: T,
  type: K,
  fn: (e: EventsOf<T>[K]) => void,
  options?: AddEventListenerOptions,
): () => void {
  if (server()) return () => {}
  owned(`on(…, '${type}')`)
  let stop: () => void
  if (options) {
    const f = (e: Event) => fn(e as Parameters<typeof fn>[0])
    target.addEventListener(type, f, options)
    stop = () => {
      target.removeEventListener(type, f, options)
      if (DEV) open.delete(f)
    }
    if (DEV) open.set(f, [`\`${type}\` listener${where()}`, stop])
  } else stop = listen(target, type, fn as Handler, `\`${type}\` listener${where()}`)
  onCleanup(stop)
  return stop
}

const units: Record<string, number> = { ms: 1, s: 1e3, m: 6e4, h: 36e5 }

/** `fn` every `every` (ms, or `'500ms'`, `'1s'`, `'5m'`, `'1h'`) until the owner is disposed. Returns a stop function. */
export function interval(
  every: number | `${number}${'ms' | 's' | 'm' | 'h'}`,
  fn: () => void,
): () => void {
  if (server()) return () => {}
  owned('interval()')
  const m = typeof every === 'number' ? null : /^([\d.]+)(ms|s|m|h)$/.exec(every)
  const ms = m ? +m[1]! * units[m[2]!]! : +every
  if (DEV && !(ms > 0))
    throw new Error(
      `interval: '${every}' isn't a duration\n  fix: a number of ms, or '500ms', '1s', '5m', '1h'`,
    )
  const id = setInterval(fn, ms)
  const key = {}
  const stop = () => {
    clearInterval(id)
    if (DEV) open.delete(key)
  }
  if (DEV)
    open.set(key, [`interval(${typeof every === 'number' ? every : `'${every}'`})${where()}`, stop])
  onCleanup(stop)
  return stop
}

// ---- tabs ---------------------------------------------------------------------------------------------------------

/** A line between this page's tabs: what's sent reaches the others, checked against a schema when there is one. */
export interface TabChannel<T> {
  /** To every other tab of this origin. Validated first: a wrong message throws in dev, and is dropped in production. */
  post(message: T): void
  /** Each message from another tab, until the owner is disposed. Returns a stop function. */
  on(fn: (message: T) => void): () => void
  /** The last message from another tab. */
  readonly value: T | undefined
}

interface TabLine {
  bc: BroadcastChannel
  refs: number
  fns: Set<(data: unknown) => void>
}
const lines = new Map<string, TabLine>()

const valid = <T>(schema: StandardSchema<T>, v: unknown): { value: T } | undefined => {
  const r = schema['~standard'].validate(v)
  return r instanceof Promise || r.issues ? undefined : { value: r.value }
}

/**
 * `BroadcastChannel`, typed and validated (research 32 §1): one per name per document, removed with the owner. A
 * received message the schema refuses is dropped, because the other tab may be an older deploy. Inert on the server.
 */
function channel<T>(name: string, schema: StandardSchema<T>): TabChannel<T> {
  if (DEV && !schema?.['~standard'])
    throw new Error(
      `tabs.channel('${name}') needs a schema: another tab can be another deploy.\n  fix: tabs.channel('${name}', z.object({ … }))`,
    )
  const last = box<T | undefined>(undefined)
  if (server() || typeof BroadcastChannel === 'undefined')
    return {
      post() {},
      on: () => () => {},
      get value() {
        return last.value
      },
    }
  owned(`tabs.channel('${name}')`)
  let line = lines.get(name)
  if (!line) {
    const made: TabLine = { bc: new BroadcastChannel(`weft:tab:${name}`), refs: 0, fns: new Set() }
    // a snapshot: a handler can remove itself while this runs
    made.bc.onmessage = (e) => {
      for (const f of [...made.fns]) f(e.data)
    }
    lines.set(name, (line = made))
  }
  const held = line
  held.refs++
  const token = {}
  const handlers = new Set<(message: T) => void>()
  const receive = (data: unknown) => {
    const ok = valid(schema, data)
    if (!ok) {
      if (DEV)
        console.warn(
          `weft: tabs.channel('${name}') dropped a message its schema refuses (another deploy's tab?)`,
        )
      return
    }
    last.value = ok.value
    // a snapshot: a handler can remove itself while this runs
    for (const f of [...handlers]) f(ok.value)
  }
  held.fns.add(receive)
  const close = () => {
    if (!held.fns.delete(receive)) return
    if (DEV) open.delete(token)
    if (--held.refs) return
    held.bc.close()
    lines.delete(name)
  }
  if (DEV) open.set(token, [`tabs.channel('${name}')${where()}`, close])
  onCleanup(close)
  return {
    post(message) {
      const ok = valid(schema, message)
      if (ok) held.bc.postMessage(ok.value)
      else if (DEV) throw new Error(`tabs.channel('${name}'): the message doesn't match its schema`)
    },
    on(fn) {
      handlers.add(fn)
      const stop = () => void handlers.delete(fn)
      onCleanup(stop)
      return stop
    },
    get value() {
      return last.value
    },
  }
}

/** Talking between this page's tabs. */
export const tabs = { channel }
