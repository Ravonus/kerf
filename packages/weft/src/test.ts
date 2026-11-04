// @weft-js/core/test: render, user-level queries and actions, flush, a deterministic clock, the work-budget assertion
// (§7b, §10b), the page fakes for @weft-js/core/browser (`net`, `page`, `tabs`) and the leak check (T012).
//
//   render(Counter)
//   await user.click(screen.getByRole('button', { name: 'Add' }))             // ends in flush()
//   await expect(() => fake.push('p100', 99)).toTouchAtMost(1)               // DOM mutations
//   await expect(() => fake.push('p100', 99)).toTouchAtMost(1, { runs: 10 })  // and reactive re-runs
//
// `weft check` reports junk tests statically (T001–T009); a test here that never asserts also fails at runtime (T001).

import { AsyncLocalStorage } from 'node:async_hooks'
import { screen as dom } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, vi } from 'vitest'
import { flush as flushGraph, rt, stats } from './index'
import { createComponent, render as mount } from './dom'
import { createApp, disposeApp, useApp, withApp, type AppOptions } from './scope'
import { open } from './browser'

export { scope } from './scope'
export { memoryStorage } from './memory'

/** Waits for writes to reach the DOM, and for what they started to settle. */
export async function flush() {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve()
    flushGraph()
  }
}

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

// ---- surfaces: jsdom has no canvas ----------------------------------------------------------------------------------

const calls = new WeakMap<object, { name: string; args: unknown[] }[]>()

/** A context that records every method call and keeps every property set. Reads of anything else return a no-op. */
function recording(canvas: HTMLCanvasElement) {
  const log: { name: string; args: unknown[] }[] = []
  calls.set(canvas, log)
  const values: Record<string, unknown> = {}
  const ctx: unknown = new Proxy(
    {},
    {
      get(_, key: string) {
        if (key in values) return values[key]
        if (key === 'measureText')
          return (text: string) => ({
            width: text.length * 8,
            fontBoundingBoxAscent: 12,
            fontBoundingBoxDescent: 4,
          })
        if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
        if (key === 'getExtension') return () => null
        if (key === 'canvas') return canvas
        return (...args: unknown[]) => {
          log.push({ name: key, args })
          return ctx
        }
      },
      set(_, key: string, value) {
        values[key] = value
        return true
      },
    },
  )
  return ctx
}

/** The calls a surface made on this canvas's context, in order (jsdom only): `canvasCalls(c).filter(c => c.name === 'fillText')`. */
export const canvasCalls = (canvas: HTMLCanvasElement) => calls.get(canvas) ?? []

if (typeof HTMLCanvasElement !== 'undefined') {
  const contexts = new WeakMap<object, unknown>()
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    if (!contexts.has(this)) contexts.set(this, recording(this))
    return contexts.get(this)
  } as unknown as typeof HTMLCanvasElement.prototype.getContext
}

/** A deterministic `text.measure` for jsdom: every character is 8 px wide and lines break at spaces. */
export function fakeMeasure() {
  type H = { exact: boolean; ready: null; text: string }
  const wrap = (h: H, width: number) => {
    const out: { width: number; text: string }[] = []
    let line = ''
    for (const word of h.text.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && next.length * 8 > width) {
        out.push({ width: line.length * 8, text: line })
        line = word
      } else line = next
    }
    if (line) out.push({ width: line.length * 8, text: line })
    return out
  }
  return {
    prepare: (text: string): H => ({ exact: true, ready: null, text }),
    layout: (h: H, width: number, lineHeight: number) => {
      const n = wrap(h, width).length
      return { height: n * lineHeight, lineCount: n }
    },
    lines: wrap,
    lineText: (_: H, line: { text: string }) => line.text,
    clear() {},
  }
}

/**
 * Queries by what the user sees: role, label and text (`getBy*` throws, `queryBy*` returns null, `findBy*` waits).
 * There is no container, selector or test-id query (T005).
 */
export const screen = {
  // oxlint-disable typescript/unbound-method -- testing-library's queries are bound functions, only typed as methods
  getByRole: dom.getByRole,
  getAllByRole: dom.getAllByRole,
  queryByRole: dom.queryByRole,
  queryAllByRole: dom.queryAllByRole,
  findByRole: dom.findByRole,
  findAllByRole: dom.findAllByRole /* oxlint-enable typescript/unbound-method */,
  // oxlint-disable typescript/unbound-method -- testing-library's queries are bound functions, only typed as methods
  getByLabelText: dom.getByLabelText,
  getAllByLabelText: dom.getAllByLabelText,
  queryByLabelText: dom.queryByLabelText,
  queryAllByLabelText: dom.queryAllByLabelText,
  findByLabelText: dom.findByLabelText,
  findAllByLabelText: dom.findAllByLabelText /* oxlint-enable typescript/unbound-method */,
  // oxlint-disable typescript/unbound-method -- testing-library's queries are bound functions, only typed as methods
  getByText: dom.getByText,
  getAllByText: dom.getAllByText,
  queryByText: dom.queryByText,
  queryAllByText: dom.queryAllByText,
  findByText: dom.findByText,
  findAllByText: dom.findAllByText /* oxlint-enable typescript/unbound-method */,
}

type UserEvent = ReturnType<typeof userEvent.setup>
type Actions = Pick<
  UserEvent,
  | 'click'
  | 'dblClick'
  | 'type'
  | 'clear'
  | 'keyboard'
  | 'hover'
  | 'unhover'
  | 'tab'
  | 'selectOptions'
  | 'deselectOptions'
  | 'upload'
  | 'paste'
>

let session: UserEvent | undefined
const act = <K extends keyof Actions>(name: K) =>
  (async (...args: unknown[]) => {
    session ??= userEvent.setup({
      advanceTimers: (ms) =>
        clock.installed ? vi.advanceTimersByTimeAsync(ms).then(() => {}) : undefined,
    })
    await (session[name] as (...a: unknown[]) => Promise<void>)(...args)
    await flush()
  }) as unknown as Actions[K]

/** User actions (`@testing-library/user-event`); each one ends in `flush()`, so there is nothing to wait for (T004). */
export const user: Actions = {
  click: act('click'),
  dblClick: act('dblClick'),
  type: act('type'),
  clear: act('clear'),
  keyboard: act('keyboard'),
  hover: act('hover'),
  unhover: act('unhover'),
  tab: act('tab'),
  selectOptions: act('selectOptions'),
  deselectOptions: act('deselectOptions'),
  upload: act('upload'),
  paste: act('paste'),
}

const faked = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'Date',
  'performance',
] as const

/**
 * A deterministic clock for timers, `resource` fetches that wait on them, and rAF. `install()` before anything
 * schedules; every `advance` ends in `flush()`. Uninstalled after each test. Use it instead of sleeping (T004).
 */
export const clock = {
  installed: false,
  install(now: number | Date = 0) {
    vi.useFakeTimers({ toFake: [...faked], now })
    clock.installed = true
  },
  async advance(ms: number) {
    if (!clock.installed)
      throw new Error(
        'T004: clock.advance() needs clock.install() first, before the code under test schedules its timers',
      )
    await vi.advanceTimersByTimeAsync(ms)
    await flush()
  },
  /** Run every pending timer (and the ones they schedule), then flush. */
  async runAll() {
    if (!clock.installed) throw new Error('T004: clock.runAll() needs clock.install() first')
    await vi.runAllTimersAsync()
    await flush()
  },
  now: () => Date.now(),
  uninstall() {
    if (!clock.installed) return
    vi.useRealTimers()
    clock.installed = false
  },
}

afterEach((context) => {
  cleanup()
  clock.uninstall()
  session = undefined
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
      `T001: "${context.task.name}" made no assertion, so it passes as long as nothing throws.\n  fix: assert what the user sees, e.g. expect(screen.getByRole('button').textContent).toBe('Count 1'). Docs: weft docs T001`,
    )
})

// ---- @weft-js/core/browser: the leak check (T012) and the page fakes -----------------------------------------------------

/** What @weft-js/core/browser has open right now: listeners, intervals and subscribed values, with where they were made. */
export const leaks = (): string[] => [...open.values()].map(([what]) => what)

/**
 * T012: fail when subscriptions, listeners or intervals are still open (run after each test, once its renders are
 * unmounted). Closes them, so one leak doesn't fail the next test too.
 */
export function assertNoLeaks() {
  if (!open.size) return
  const list = leaks()
  for (const [, close] of Array.from(open.values())) close()
  throw new Error(
    `T012: the test ended with ${list.length} open subscription${list.length > 1 ? 's' : ''}, listener${list.length > 1 ? 's' : ''} or interval${list.length > 1 ? 's' : ''}:\n${list.map((w) => `  - ${w}`).join('\n')}\n` +
      '  fix: unmount what the test created (`render` unmounts itself; call the `dispose` of any `createRoot`), or fix the leak: create them in setup, where their owner removes them',
  )
}

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
 * The fake transport for @weft-js/start's server functions (research 27 §7). With @weft-js/core/test loaded, `query`/`mutation`
 * calls run in process through the server's executor (validation, request cache, tags, single-flight, a JSON round
 * trip) instead of HTTP. @weft-js/start finds these controls under a global symbol, so weft doesn't depend on it.
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
  /** @weft-js/start registers its client cache reset here. */
  resets: [] as (() => void)[],
  /** Subscriptions an owner holds: `assertNoLeaks` reads the same map as @weft-js/core/browser's. */
  open,
  /** The channel fake while a socket is open (@weft-js/start's channel.ts). */
  ws: undefined as
    | undefined
    | {
        publish(id: string, params: unknown, name: string, msg: unknown): Promise<void>
        drop(): void
        recheck(): Promise<void>
      },
  /** What this client's sockets sent. */
  sent: [] as { id: string; name: string; msg: unknown }[],
  /** The realtime fake while one is connected (@weft-js/start's live.ts). */
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
;(globalThis as unknown as Record<symbol, unknown>)[Symbol.for('weft.net')] = transport

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

/** The network as @weft-js/core/browser's `online()` and @weft-js/start's server functions see it. */
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
    deliver(`weft:tab:${name}`, structuredClone(message))
    return flush()
  },
  /** What this page posted, in order. */
  posted: (name: string) => (posted.get(`weft:tab:${name}`) ?? []).slice(),
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

/** What `toTouchAtMost` counts a write's cost by. */
export type Touches = {
  mutations: number
  /** Reactive computations re-run (derived values and bindings). */
  runs: number
  added: number
  removed: number
  text: number
  attributes: number
}

/** Count the DOM mutations and reactive re-runs one interaction causes, after everything has settled. */
export async function touches(interaction: () => unknown): Promise<Touches> {
  const records: MutationRecord[] = []
  const observer = new MutationObserver((r) => records.push(...r))
  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })
  const runs = stats.runs
  await interaction()
  await flush()
  records.push(...observer.takeRecords())
  observer.disconnect()
  const t: Touches = {
    mutations: records.length,
    runs: stats.runs - runs,
    added: 0,
    removed: 0,
    text: 0,
    attributes: 0,
  }
  for (const r of records) {
    if (r.type === 'characterData') t.text++
    else if (r.type === 'attributes') t.attributes++
    else {
      t.added += r.addedNodes.length
      t.removed += r.removedNodes.length
    }
  }
  return t
}

expect.extend({
  async toTouchAtMost(
    interaction: () => unknown,
    mutations: number,
    budget: { runs?: number } = {},
  ) {
    const t = await touches(interaction)
    const pass = t.mutations <= mutations && (budget.runs === undefined || t.runs <= budget.runs)
    const limits = `≤ ${mutations} DOM mutations${budget.runs === undefined ? '' : ` and ≤ ${budget.runs} re-runs`}`
    const got = `${t.mutations} mutations (${t.added} added, ${t.removed} removed, ${t.text} text, ${t.attributes} attributes), ${t.runs} re-runs`
    return {
      pass,
      message: () =>
        pass
          ? `expected the interaction to exceed ${limits}, got ${got}`
          : `expected ${limits}, got ${got}. A large count with few visible changes usually means rows were rebuilt or re-run: check for new item identities (W014) or a missing key (W010).`,
    }
  },
})

declare module 'vitest' {
  interface Assertion<R, T> {
    toTouchAtMost(mutations: number, budget?: { runs?: number }): Promise<void>
  }
  interface AsymmetricMatchersContaining {
    toTouchAtMost(mutations: number, budget?: { runs?: number }): void
  }
}
