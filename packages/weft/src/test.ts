// weft/test: render, user-level queries and actions, flush, a deterministic clock, and the work-budget assertion
// (§7b, §10b).
//
//   render(Counter)
//   await user.click(screen.getByRole('button', { name: 'Add' }))             // ends in flush()
//   await expect(() => fake.push('p100', 99)).toTouchAtMost(1)               // DOM mutations
//   await expect(() => fake.push('p100', 99)).toTouchAtMost(1, { runs: 10 })  // and reactive re-runs
//
// `weft check` reports junk tests statically (T001–T009); a test here that never asserts also fails at runtime (T001).

import { screen as dom } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, vi } from 'vitest'
import { flush as flushGraph, stats } from './index'
import { createComponent, render as mount } from './dom'
import { createApp, useApp, withApp, type AppOptions } from './scope'

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
    container.remove()
  }
  mounted.add(unmount)
  return { container, unmount }
}

export function cleanup() {
  for (const unmount of [...mounted]) unmount()
}

/**
 * Queries by what the user sees: role, label and text (`getBy*` throws, `queryBy*` returns null, `findBy*` waits).
 * There is no container, selector or test-id query (T005).
 */
export const screen = {
  getByRole: dom.getByRole, getAllByRole: dom.getAllByRole, queryByRole: dom.queryByRole, queryAllByRole: dom.queryAllByRole, findByRole: dom.findByRole, findAllByRole: dom.findAllByRole,
  getByLabelText: dom.getByLabelText, getAllByLabelText: dom.getAllByLabelText, queryByLabelText: dom.queryByLabelText, queryAllByLabelText: dom.queryAllByLabelText, findByLabelText: dom.findByLabelText, findAllByLabelText: dom.findAllByLabelText,
  getByText: dom.getByText, getAllByText: dom.getAllByText, queryByText: dom.queryByText, queryAllByText: dom.queryAllByText, findByText: dom.findByText, findAllByText: dom.findAllByText,
}

type UserEvent = ReturnType<typeof userEvent.setup>
type Actions = Pick<UserEvent, 'click' | 'dblClick' | 'type' | 'clear' | 'keyboard' | 'hover' | 'unhover' | 'tab' | 'selectOptions' | 'deselectOptions' | 'upload' | 'paste'>

let session: UserEvent | undefined
const act = <K extends keyof Actions>(name: K) =>
  (async (...args: any[]) => {
    session ??= userEvent.setup({ advanceTimers: ms => (clock.installed ? vi.advanceTimersByTimeAsync(ms).then(() => {}) : undefined) })
    await (session[name] as (...a: any[]) => Promise<void>)(...args)
    await flush()
  }) as Actions[K]

/** User actions (`@testing-library/user-event`); each one ends in `flush()`, so there is nothing to wait for (T004). */
export const user: Actions = {
  click: act('click'), dblClick: act('dblClick'), type: act('type'), clear: act('clear'), keyboard: act('keyboard'), hover: act('hover'),
  unhover: act('unhover'), tab: act('tab'), selectOptions: act('selectOptions'), deselectOptions: act('deselectOptions'), upload: act('upload'), paste: act('paste'),
}

const faked = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date', 'performance'] as const

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
    if (!clock.installed) throw new Error('T004: clock.advance() needs clock.install() first, before the code under test schedules its timers')
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

afterEach(context => {
  cleanup()
  clock.uninstall()
  session = undefined
  // T001 at runtime: catches what the static check can't see (assertions hidden in helpers it couldn't read, or none).
  const failed = context.task.result?.state === 'fail' || (context.task.result?.errors?.length ?? 0) > 0
  if (!failed && !context.task.fails && expect.getState().assertionCalls === 0)
    throw new Error(`T001: "${context.task.name}" made no assertion, so it passes as long as nothing throws.\n  fix: assert what the user sees, e.g. expect(screen.getByRole('button').textContent).toBe('Count 1'). Docs: weft docs T001`)
})

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
