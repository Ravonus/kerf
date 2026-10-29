// weft/test: render, flush, the work-budget assertion (§7b, §10b), the page fakes for weft/browser (`net`, `page`)
// and the leak check (T012).
//
//   await expect(() => fake.push('p100', 99)).toTouchAtMost(1)               // DOM mutations
//   await expect(() => fake.push('p100', 99)).toTouchAtMost(1, { runs: 10 })  // and reactive re-runs

import { afterEach, expect } from 'vitest'
import { flush as flushGraph, stats } from './index'
import { createComponent, render as mount } from './dom'
import { createApp, disposeApp, useApp, withApp, type AppOptions } from './scope'
import { open } from './browser'

export { scope } from './scope'
export { memoryStorage } from './memory'

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
export function render<P extends object>(Comp: (props: P) => any, props: P = {} as P, options: AppOptions = {}) {
  const app = createApp(options)
  useApp(app)
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

export function cleanup() {
  for (const unmount of [...mounted]) unmount()
}

afterEach(() => {
  cleanup()
  try { assertNoLeaks() } finally { resetPage() }
})

// ---- weft/browser: the leak check (T012) and the page fakes -----------------------------------------------------

/** What weft/browser has open right now: listeners, intervals and subscribed values, with where they were made. */
export const leaks = (): string[] => [...open.values()].map(([what]) => what)

/**
 * T012: fail when subscriptions, listeners or intervals are still open (run after each test, once its renders are
 * unmounted). Closes them, so one leak doesn't fail the next test too.
 */
export function assertNoLeaks() {
  if (!open.size) return
  const list = leaks()
  for (const [, close] of [...open.values()]) close()
  throw new Error(
    `T012: the test ended with ${list.length} open subscription${list.length > 1 ? 's' : ''}, listener${list.length > 1 ? 's' : ''} or interval${list.length > 1 ? 's' : ''}:\n${list.map(w => `  - ${w}`).join('\n')}\n` +
      '  fix: unmount what the test created (`render` unmounts itself; call the `dispose` of any `createRoot`), or fix the leak: create them in setup, where their owner removes them',
  )
}

const fake = { online: true, visibility: 'visible' as DocumentVisibilityState, focus: true, media: new Map<string, boolean>() }
const lists = new Map<string, EventTarget & { media: string; matches: boolean }>()

function installPage() {
  if (typeof document == 'undefined') return
  const define = (o: object, key: string, get: () => unknown) => Object.defineProperty(o, key, { configurable: true, get })
  define(navigator, 'onLine', () => fake.online)
  define(document, 'visibilityState', () => fake.visibility)
  define(document, 'hidden', () => fake.visibility == 'hidden')
  Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => fake.focus })
  // jsdom has no matchMedia: one MediaQueryList per query, matching what `page.media` set (default false).
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => {
      let list = lists.get(media)
      if (!list) lists.set(media, (list = Object.defineProperty(Object.assign(new EventTarget(), { media }), 'matches', { get: () => fake.media.get(media) ?? false }) as any))
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

const fire = (target: EventTarget, type: string, init?: object) => target.dispatchEvent(Object.assign(new Event(type), init))

/** The network as weft/browser's `online()` sees it. Phase 3 adds the fake transport (`net.drop`, `net.latency`). */
export const net = {
  offline() { fake.online = false; fire(window, 'offline'); return flush() },
  online() { fake.online = true; fire(window, 'online'); return flush() },
}

const visibility = (to: DocumentVisibilityState) => { fake.visibility = to; fire(document, 'visibilitychange') }

/**
 * The page as `visible()`, `lifecycle()` and `media()` see it. The page starts visible, focused and online, with
 * every media query false; each test starts from that again. Each call fires the real events, then flushes.
 */
export const page = {
  hide() { visibility('hidden'); return flush() },
  show() { visibility('visible'); return flush() },
  blur() { fake.focus = false; fire(window, 'blur'); return flush() },
  focus() { fake.focus = true; fire(window, 'focus'); return flush() },
  freeze() { fire(document, 'freeze'); return flush() },
  resume() { fire(document, 'resume'); return flush() },
  /** Leave the page: hidden, then `pagehide`. `persisted`: kept in the back/forward cache (frozen), else terminated. */
  leave({ persisted = false } = {}) { visibility('hidden'); fire(window, 'pagehide', { persisted }); return flush() },
  /** Come back from the back/forward cache. */
  restore() { fire(window, 'pageshow', { persisted: true }); visibility('visible'); return flush() },
  /** Make `query` match (or not) and fire its `change`. */
  media(query: string, matches: boolean) {
    fake.media.set(query, matches)
    const list = lists.get(query)
    if (list) fire(list, 'change', { matches, media: query })
    return flush()
  },
}

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
  const observer = new MutationObserver(r => records.push(...r))
  observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
  const runs = stats.runs
  await interaction()
  await flush()
  records.push(...observer.takeRecords())
  observer.disconnect()
  const t: Touches = { mutations: records.length, runs: stats.runs - runs, added: 0, removed: 0, text: 0, attributes: 0 }
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
  async toTouchAtMost(interaction: () => unknown, mutations: number, budget: { runs?: number } = {}) {
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
  interface Assertion<T = any> {
    toTouchAtMost(mutations: number, budget?: { runs?: number }): Promise<T>
  }
  interface AsymmetricMatchersContaining {
    toTouchAtMost(mutations: number, budget?: { runs?: number }): void
  }
}
