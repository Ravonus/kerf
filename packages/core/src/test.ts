// @kerf-js/core/test: render, user-level queries and actions, flush, a deterministic clock, the work-budget assertion
// (§7b, §10b), the page fakes for @kerf-js/core/browser (`net`, `page`, `tabs`) and the leak check (T012).
//
//   render(Counter)
//   await user.click(screen.getByRole('button', { name: 'Add' }))             // ends in flush()
//   await expect(() => fake.push('p100', 99)).toTouchAtMost(1)               // DOM mutations
//   await expect(() => fake.push('p100', 99)).toTouchAtMost(1, { runs: 10 })  // and reactive re-runs
//
// `kerf check` reports junk tests statically (T001–T009); a test here that never asserts also fails at runtime (T001).

import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, expect } from 'vitest'
import { rt } from './index/graph'
import { createComponent, render as mount } from './dom'
import { open } from './browser'
import { createApp, disposeApp, useApp, withApp, type AppOptions } from './scope'
import { assertNoLeaks } from './test-support/leaks'
import { flush } from './test-support/flush'
import { installCanvas } from './test-support/canvas'
import { clock } from './test-support/clock'
import { resetUser } from './test-support/user'
import { installTouchMatcher } from './test-support/touches'

export { leaks, assertNoLeaks } from './test-support/leaks'
export { flush } from './test-support/flush'
export { canvasCalls, fakeMeasure } from './test-support/canvas'
export { clock } from './test-support/clock'
export { screen, user } from './test-support/user'
export { touches, type Touches } from './test-support/touches'

export { scope } from './scope'
export { memoryStorage } from './memory'

const mounted = new Set<() => void>()

/**
 * Mount a component into a fresh container, with a fresh app: every `defineState` scope starts from its setup.
 * `options.state` seeds scopes (`{ cart: { note: 'hi' } }`); pass one `storage` to several renders to test reloads.
 * Unmounted automatically after each test.
 */
export function render<P extends object>(
  Comp: (props: P) => unknown,
  props: P = {} as P,
  options: AppOptions & {
    /** Slot overrides: `{ 'text.measure': fakeMeasure() }`. */ slots?: Record<string, unknown>
  } = {},
) {
  const app = createApp(options)
  useApp(app)
  if (options.slots) rt.slots = options.slots
  const container = document.body.appendChild(document.createElement('div'))
  const dispose = mount(() => withApp(app, () => createComponent(Comp, props)), container)
  const unmount = () => {
    if (!mounted.delete(unmount)) return
    dispose()
    disposeApp(app)
    container.remove()
  }
  mounted.add(unmount)
  return { container, unmount }
}

/** Unmounts everything `render` mounted, and clears what a test set up. */
export function cleanup() {
  for (const unmount of Array.from(mounted)) unmount()
  rt.slots = undefined
}

installCanvas()

afterEach((context) => {
  cleanup()
  clock.uninstall()
  resetUser()
  try {
    assertNoLeaks()
  } finally {
    resetPage()
    resetTransport()
    lines.clear()
    posted.clear()
  } // T012
  // T001 at runtime: catches what the static check can't see (assertions hidden in helpers it couldn't read, or none).
  const failed =
    context.task.result?.state === 'fail' || (context.task.result?.errors?.length ?? 0) > 0
  if (!failed && !context.task.fails && expect.getState().assertionCalls === 0)
    throw new Error(
      `T001: "${context.task.name}" made no assertion, so it passes as long as nothing throws.\n  fix: assert what the user sees, e.g. expect(screen.getByRole('button').textContent).toBe('Count 1'). Docs: kerf docs T001`,
    )
})

// ---- @kerf-js/core/browser: the leak check (T012) and the page fakes -----------------------------------------------------

const fake = {
  online: true,
  visibility: 'visible' as DocumentVisibilityState,
  focus: true,
  media: new Map<string, boolean>(),
}
const lists = new Map<string, EventTarget & { media: string; matches: boolean }>()

function installPage() {
  if (typeof document === 'undefined') return
  const define = (o: object, key: string, get: () => unknown) =>
    Object.defineProperty(o, key, { configurable: true, get })
  define(navigator, 'onLine', () => fake.online)
  define(document, 'visibilityState', () => fake.visibility)
  define(document, 'hidden', () => fake.visibility === 'hidden')
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => fake.focus })
  // jsdom has no matchMedia: one MediaQueryList per query, matching what `page.media` set (default false).
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => {
      let list = lists.get(media)
      if (!list)
        lists.set(
          media,
          (list = Object.defineProperty(Object.assign(new EventTarget(), { media }), 'matches', {
            get: () => fake.media.get(media) ?? false,
          }) as unknown as NonNullable<typeof list>),
        )
      return list
    },
  })
}

function resetPage() {
  Object.assign(fake, { online: true, visibility: 'visible', focus: true })
  fake.media.clear()
  lists.clear()
}

installPage()

const fire = (target: EventTarget, type: string, init?: object) =>
  target.dispatchEvent(Object.assign(new Event(type), init))

/**
 * The fake transport for @kerf-js/start's server functions (research 27 §7). With @kerf-js/core/test loaded, `query`/`mutation`
 * calls run in process through the server's executor (validation, request cache, tags, single-flight, a JSON round
 * trip) instead of HTTP. @kerf-js/start finds these controls under a global symbol, so Kerf doesn't depend on it.
 */
type FnRef = { $id: string } | string
const fnId = (f: FnRef) => (typeof f === 'string' ? f : f.$id)
const transport = {
  latency: 0,
  ctx: undefined as object | undefined,
  online: () => fake.online,
  fails: new Map<string, unknown[]>(),
  handlers: new Map<string, (input: never, ctx: never) => unknown>(),
  log: [] as { id: string; kind: string; input: unknown }[],
  /** Calls in flight (`net.settle()` waits for them). */
  inflight: new Set<Promise<unknown>>(),
  /** Inside a call, the fake request's scope: nested calls in a `run` are server calls, as on a real server. */
  als: new AsyncLocalStorage<unknown>(),
  /** @kerf-js/start registers its client cache reset here. */
  resets: [] as (() => void)[],
  /** Subscriptions an owner holds: `assertNoLeaks` reads the same map as @kerf-js/core/browser's. */
  open,
  /** The channel fake while a socket is open (@kerf-js/start's channel.ts). */
  ws: undefined as
    | undefined
    | {
        publish(id: string, params: unknown, name: string, msg: unknown): Promise<void>
        drop(): void
        recheck(): Promise<void>
      },
  /** What this client's sockets sent. */
  sent: [] as { id: string; name: string; msg: unknown }[],
  /** The realtime fake while one is connected (@kerf-js/start's live.ts). */
  rt: undefined as
    | undefined
    | {
        push(id: string, msg: unknown): number
        poke(tags: string[]): Promise<void>
        drop(): void
        subscriptions(): { kind: string; id: string; input: unknown }[]
      },
  /** Times the realtime connection was lost. */
  reconnects: 0,
  /** Server extensions for this test (`net.extension`): a plugin's fake runs through the real scope. */
  extensions: [] as { reset?(): void }[],
}
;(globalThis as unknown as Record<symbol, unknown>)[Symbol.for('kerf.net')] = transport

function resetTransport() {
  for (const e of transport.extensions) e.reset?.()
  transport.extensions.length = 0
  Object.assign(transport, { latency: 0, ctx: undefined })
  transport.fails.clear()
  transport.handlers.clear()
  transport.log.length = 0
  transport.sent.length = 0
  transport.inflight.clear()
  for (const r of transport.resets) r()
}

/** The network as @kerf-js/core/browser's `online()` and @kerf-js/start's server functions see it. */
export const net = {
  /** Offline: `online()` turns false, and server function calls reject with an `OfflineError`. */
  offline() {
    fake.online = false
    fire(window, 'offline')
    return flush()
  },
  online() {
    fake.online = true
    fire(window, 'online')
    return flush()
  },
  /** Every server function call waits `ms` first (fake timers: advance them with `clock.tick`). */
  latency(ms: number) {
    transport.latency = ms
  },
  /** The `ctx` server functions get (`{ db, user }`); `request` and `response` are added. */
  context(ctx: object) {
    transport.ctx = ctx
  },
  /** A plugin's server extension in the fake scope, for this test: its `context` and `guard` run, and `reset` after it. */
  extension(extension: { reset?(): void }) {
    transport.extensions.push(extension)
  },
  /** The next call of `fn` rejects with `error` (queue several by calling again). */
  fail(fn: FnRef, error: unknown = new Error(`net.fail(${fnId(fn)})`)) {
    const id = fnId(fn)
    transport.fails.set(id, [...(transport.fails.get(id) ?? []), error])
  },
  /** Replace `fn`'s `run`: `net.handle(listTodos, () => [{ id: '1', title: 'Milk', done: false }])`. */
  handle<I = never, O = unknown>(fn: FnRef, run: (input: I, ctx: never) => O | Promise<O>) {
    transport.handlers.set(fnId(fn), run)
  },
  /** The calls so far, in order: `{ id, kind, input }`. */
  calls() {
    return transport.log.slice()
  },
  /** A message straight to every reader of `stream`, as the server would send it. Returns how many got it. */
  push(stream: FnRef, message: unknown) {
    const n = connected().push(fnId(stream), message)
    return flush().then(() => n)
  },
  /** Poke these tags, as a mutation on another server or tab would. */
  async poke(...tags: string[]) {
    await connected().poke(tags)
    await net.settle()
  },
  /** Cut the realtime connection and the channel socket: the client reconnects and resumes, as after a dropped socket. */
  drop() {
    if (!transport.ws) connected()
    transport.rt?.drop()
    transport.ws?.drop()
    return net.settle()
  },
  /** A message to everyone in a room, as another user's `room.publish` would: `net.publish(room, { roomId }, 'said', row)`. */
  async publish(room: FnRef, params: unknown, name: string, message: unknown) {
    if (!transport.ws)
      throw new Error(
        'net: no channel socket yet: render a `.connect()`, then `await net.settle()`',
      )
    await transport.ws.publish(fnId(room), params, name, message)
    await net.settle()
  },
  /** What this client's sockets sent: `{ id, name, msg }`, in order. */
  sent(room?: FnRef) {
    return transport.sent.filter((s) => !room || s.id === fnId(room))
  },
  /** A new `ctx` (or none: signed out), and the session re-check at once. */
  async session(ctx: object) {
    transport.ctx = ctx
    await transport.ws?.recheck()
    await net.settle()
  },
  /** How many times the realtime connection was lost so far. */
  reconnects: () => transport.reconnects,
  /** What the client is subscribed to: `{ kind, id, input }`. */
  subscriptions: () => transport.rt?.subscriptions() ?? [],
  /** Wait until no call is in flight (with latency: real time, or `clock.tick` under fake timers), then flush. */
  async settle() {
    for (let i = 0; i < 100; i++) {
      await flush()
      if (!transport.inflight.size) return
      await Promise.allSettled(transport.inflight)
    }
    throw new Error('net.settle(): calls kept starting (a refetch loop?)')
  },
}

function connected() {
  if (!transport.rt)
    throw new Error(
      'net: no realtime connection yet: render a `.live()` or a stream, then `await net.settle()`',
    )
  return transport.rt
}

// ---- tabs: BroadcastChannel without a real one, so a `render()` is a tab ---------------------------------------------

const lines = new Map<string, Set<FakeLine>>()
const posted = new Map<string, unknown[]>()

class FakeLine {
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor(public name: string) {
    if (!lines.has(name)) lines.set(name, new Set())
    lines.get(name)!.add(this)
  }
  postMessage(data: unknown) {
    const copy = structuredClone(data)
    posted.set(this.name, [...(posted.get(this.name) ?? []), copy])
    deliver(this.name, copy, this)
  }
  close() {
    lines.get(this.name)?.delete(this)
  }
}

function deliver(name: string, data: unknown, from?: FakeLine) {
  queueMicrotask(() => {
    for (const line of Array.from(lines.get(name) ?? []))
      if (line !== from) line.onmessage?.({ data })
  })
}

if (typeof document !== 'undefined')
  (globalThis as Record<string, unknown>).BroadcastChannel = FakeLine

/**
 * Other tabs. Two `render()`s are two tabs: each gets its own channels, and a shared `storage` is the shared
 * `localStorage`. `tabs.channel` names here are the ones the app gave it.
 */
export const tabs = {
  /** A message from another tab. */
  post(name: string, message: unknown) {
    deliver(`kerf:tab:${name}`, structuredClone(message))
    return flush()
  },
  /** What this page posted, in order. */
  posted: (name: string) => (posted.get(`kerf:tab:${name}`) ?? []).slice(),
}

const visibility = (to: DocumentVisibilityState) => {
  fake.visibility = to
  fire(document, 'visibilitychange')
}

/**
 * The page as `visible()`, `lifecycle()` and `media()` see it. The page starts visible, focused and online, with
 * every media query false; each test starts from that again. Each call fires the real events, then flushes.
 */
export const page = {
  hide() {
    visibility('hidden')
    return flush()
  },
  show() {
    visibility('visible')
    return flush()
  },
  blur() {
    fake.focus = false
    fire(window, 'blur')
    return flush()
  },
  focus() {
    fake.focus = true
    fire(window, 'focus')
    return flush()
  },
  freeze() {
    fire(document, 'freeze')
    return flush()
  },
  resume() {
    fire(document, 'resume')
    return flush()
  },
  /** Leave the page: hidden, then `pagehide`. `persisted`: kept in the back/forward cache (frozen), else terminated. */
  leave({ persisted = false } = {}) {
    visibility('hidden')
    fire(window, 'pagehide', { persisted })
    return flush()
  },
  /** Come back from the back/forward cache. */
  restore() {
    fire(window, 'pageshow', { persisted: true })
    visibility('visible')
    return flush()
  },
  /** Make `query` match (or not) and fire its `change`. */
  media(query: string, matches: boolean) {
    fake.media.set(query, matches)
    const list = lists.get(query)
    if (list) fire(list, 'change', { matches, media: query })
    return flush()
  },
}

installTouchMatcher()
