// @weft-js/core/agent: drive and inspect the running app from inside the page, in whatever browser the agent already has
// (Claude's browser pane, Claude in Chrome, Codex's browser, a headless Chrome). Dev builds only; the weft() Vite
// plugin loads it when serving. Two ways in, one implementation:
//
//   - the agent's own browser runs JS: `await __weft__.agent.snapshot()`, `await __weft__.agent.act({ role: 'button', name: 'Add' }, 'click')`
//   - `weft browser …` / the `weft mcp` browser tools: the dev server relays each command to the open tab (vite.mjs)
//
// Queries and actions are @weft-js/core/test's own (Testing Library role/label/text queries, user-event), so what an agent does
// here records straight into a `@weft-js/core/test` test. Snapshots are the page's roles and names with refs, plus the reactive
// graph with real names (@weft-js/core/devtools). The clock and the network are faked in the page, like @weft-js/core/test's `clock` and
// `net`, for reconnect and timeout scenarios.

import { getConfig, screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { computeAccessibleName, getRole } from 'dom-accessibility-api'
import { errors, format, graph, overlay, set } from './devtools'
import { clip, tree, diff } from './agent/tree'
import { describe, find, findAll, ref } from './agent/targets'
import { listen } from './agent/listen'
import { buildCode } from './agent/code'
import { consoleLog, patchConsole } from './agent/console'
import { real, settle, sleep } from './agent/real'
import { flush as flushGraph } from './index'
import { clock, install, setClockLog } from './agent/clock'
import { net, patchNetwork, setNetworkLog } from './agent/network'

import type { Target, Action, Expectation, Query, Step, CodeOptions } from './agent/types'

export { clock, net }
export type { Target, Action, Expectation, CodeOptions } from './agent/types'

// ---- targets: what the user sees ---------------------------------------------------------------------------------

// ---- snapshot ------------------------------------------------------------------------------------------------------

/** What a snapshot covers: which elements, how deep, and whether it carries the state graph. */
export interface SnapshotOptions {
  /** Only interactive elements (and nothing else): the smallest tree to act from. */
  interactive?: boolean
  /** A subtree: a target (`{ role: 'list', name: 'Products' }`) or a ref. */
  scope?: Target
  /** Return only the lines that changed since the previous snapshot. */
  delta?: boolean
  /** `false`: no graph; `'only'`: only the graph. A string other than 'only' filters it by name (`'Cart'`). */
  graph?: boolean | string
}

let last: string[] = []

/** The page as an agent reads it: a tree of roles and names, each with a ref to act on. */
export async function snapshot(options: SnapshotOptions = {}) {
  await settle()
  const root = options.scope ? find(options.scope) : document.body
  const result: Record<string, unknown> = {
    url: location.pathname + location.search + location.hash,
    title: document.title,
  }
  if (options.graph !== 'only') {
    const lines = tree(root, !!options.interactive, ref)
    if (options.delta) result.delta = diff(last, lines).join('\n') || '(no change)'
    else result.tree = lines.join('\n')
    if (!options.scope && !options.interactive) last = lines
  }
  if (options.graph !== false) {
    const nodes = graph(
      typeof options.graph === 'string' && options.graph !== 'only' ? options.graph : undefined,
    )
    result.graph = format(nodes)
  }
  const errs = errors()
  if (errs.length) result.errors = errs
  if (consoleLog.length) result.console = consoleLog.splice(0)
  return result
}

// ---- act and assert -----------------------------------------------------------------------------------------------

const user = userEvent.setup({ delay: null, document })

/** Act on one element like a user (user-event), then let the app settle. Returns what changed on the page. */
export async function act(target: Target, action: Action, value?: string) {
  const el = find(target)
  const before = tree(document.body, false, ref)
  quiet = true
  try {
    switch (action) {
      case 'click':
        await user.click(el)
        break
      case 'dblclick':
        await user.dblClick(el)
        break
      case 'hover':
        await user.hover(el)
        break
      case 'focus':
        ;(el as HTMLElement).focus()
        break
      case 'clear':
        await user.clear(el)
        break
      case 'fill':
        await user.clear(el)
        if (value) await user.type(el, value)
        break
      case 'type':
        await user.type(el, value ?? '')
        break
      case 'press':
        ;(el as HTMLElement).focus()
        await user.keyboard(value ?? '{Enter}')
        break
      case 'select':
        await user.selectOptions(el, value ?? '')
        break
      case 'check':
        if (!(el as HTMLInputElement).checked) await user.click(el)
        break
      case 'uncheck':
        if ((el as HTMLInputElement).checked) await user.click(el)
        break
      default:
        throw new Error(
          `unknown action ${action as string}: click, dblclick, hover, focus, clear, fill, type, press, select, check, uncheck`,
        )
    }
    await settle()
  } finally {
    quiet = false
  }
  log({ kind: 'act', target: describeFor(el, target), action, value })
  const after = tree(document.body, false, ref)
  last = after
  return {
    ok: true,
    target: `@${ref(el)}`,
    changes: diff(before, after).join('\n') || '(no visible change)',
    errors: errors(),
  }
}

function check(target: Target, e: Expectation): { ok: boolean; actual: unknown } {
  if ('absent' in e) {
    const n = findAll(target).length
    return { ok: n === 0, actual: `${n} found` }
  }
  if ('count' in e) {
    const n = findAll(target).length
    return { ok: n === e.count, actual: n }
  }
  const all = findAll(target)
  if (all.length !== 1) return { ok: false, actual: `${all.length} found` }
  const el = all[0] as HTMLInputElement
  if ('visible' in e) return { ok: true, actual: 'present' }
  if ('text' in e)
    return {
      ok: (el.textContent ?? '').includes(e.text),
      actual: clip(el.textContent?.trim() ?? '', 200),
    }
  if ('exactText' in e)
    return {
      ok: (el.textContent ?? '').trim() === e.exactText,
      actual: clip(el.textContent?.trim() ?? '', 200),
    }
  if ('value' in e) return { ok: el.value === e.value, actual: el.value }
  if ('checked' in e) return { ok: el.checked, actual: el.checked }
  if ('unchecked' in e) return { ok: !el.checked, actual: el.checked }
  if ('disabled' in e) return { ok: el.disabled, actual: el.disabled }
  if ('enabled' in e) return { ok: !el.disabled, actual: el.disabled ? 'disabled' : 'enabled' }
  if ('focused' in e)
    return { ok: document.activeElement === el, actual: document.activeElement === el }
  throw new Error(`unknown expectation ${JSON.stringify(e)}`)
}

/** Check what the user sees, retrying on real time for up to `timeout` ms (async loads). Recorded for `record`. */
export async function assert(target: Target, expectation: Expectation, { timeout = 1500 } = {}) {
  const until = real.now() + timeout
  let r = check(target, expectation)
  while (!r.ok && real.now() < until) {
    await sleep(25)
    flushGraph()
    r = check(target, expectation)
  }
  if (r.ok) {
    const el = findAll(target)[0]
    log({ kind: 'assert', target: el ? describeFor(el, target) : target, expectation })
  }
  return { ok: r.ok, target: describe(target), expected: expectation, actual: r.actual }
}

// ---- recorder ------------------------------------------------------------------------------------------------------

const recording = { on: false, steps: [] as Step[] }
let quiet = false // the bridge's own actions are logged by `act`, not by the listeners below

function log(step: Step) {
  if (recording.on) recording.steps.push(step)
}

/** The query a test would use for this element: role + name when that's unique, else label, else text. */
function describeFor(el: Element, given?: Target): Query {
  const role = getRole(el)
  if (role) {
    const name = computeAccessibleName(el)
    if (screen.queryAllByRole(role, name ? { name } : {}).length === 1)
      return name ? { by: 'role', role, name } : { by: 'role', role }
  }
  const labels = (el as HTMLInputElement).labels
  const label = labels?.[0]?.textContent?.trim()
  if (label && screen.queryAllByLabelText(label).length === 1) return { by: 'label', label }
  const text = el.textContent?.trim()
  if (text && text.length < 80 && screen.queryAllByText(text).length === 1)
    return { by: 'text', text }
  if (given && typeof given !== 'string')
    return 'role' in given
      ? { by: 'role', role: given.role, name: given.name }
      : 'label' in given
        ? { by: 'label', label: given.label }
        : { by: 'text', text: given.text }
  return { by: 'ref', ref: ref(el) }
}

/** The recorded steps as a `@weft-js/core/test` test: role/label/text queries, user actions, clock and net, real assertions. */
export function code(steps: Step[] = recording.steps, o: CodeOptions = {}) {
  return buildCode(steps, o)
}

/** Records what people do on the page, as steps that can be replayed or written out as a test. */
export const record = {
  start() {
    recording.on = true
    recording.steps = []
    if (clock.status().installed) log({ kind: 'clock', op: 'install' })
    return { recording: true }
  },
  stop() {
    recording.on = false
    return { recording: false, steps: recording.steps.length }
  },
  steps: () => recording.steps.slice(),
  code: (o: CodeOptions = {}) => code(recording.steps, o),
  note(text: string) {
    log({ kind: 'note', text })
    return { ok: true }
  },
}

// ---- clock ---------------------------------------------------------------------------------------------------------

setClockLog(log)

// ---- network -------------------------------------------------------------------------------------------------------

setNetworkLog(log)

// ---- console -------------------------------------------------------------------------------------------------------

// ---- the bridge ----------------------------------------------------------------------------------------------------

/** Every command the dev server relays, by name; each returns JSON. */
export const commands: Record<string, (args: never) => unknown> = {
  snapshot: (a: SnapshotOptions) => snapshot(a),
  act: (a: { target: Target; action: Action; value?: string }) => act(a.target, a.action, a.value),
  assert: (a: { target: Target; expect: Expectation; timeout?: number }) =>
    assert(a.target, a.expect, { timeout: a.timeout }),
  graph: (a: { filter?: string }) => {
    const nodes = graph(a.filter)
    return { graph: format(nodes), nodes }
  },
  set: (a: { name: string; value: unknown }) => set(a.name, a.value),
  navigate: (a: { to: string }) => {
    real.setTimeout(() => location.assign(a.to), 0)
    return { navigating: a.to }
  },
  reload: () => {
    real.setTimeout(() => location.reload(), 0)
    return { reloading: true }
  },
  time: (a: { op: 'pause' | 'advance' | 'resume' | 'status'; ms?: number; reload?: boolean }) =>
    a.op === 'pause'
      ? clock.pause({ reload: a.reload })
      : a.op === 'advance'
        ? clock.advance(a.ms ?? 0)
        : a.op === 'resume'
          ? clock.resume()
          : clock.status(),
  net: (a: { op: 'offline' | 'online' | 'latency' | 'drop' | 'reset' | 'status'; ms?: number }) =>
    a.op === 'latency' ? net.latency(a.ms ?? 0) : a.op === 'status' ? net.status() : net[a.op](),
  record: (a: { op: 'start' | 'stop' | 'steps' | 'code' | 'note'; text?: string } & CodeOptions) =>
    a.op === 'code' ? record.code(a) : a.op === 'note' ? record.note(a.text ?? '') : record[a.op](),
  logs: () => ({ console: consoleLog.splice(0), errors: errors() }),
  overlay: (a: { show?: boolean }) => ({ shown: overlay(a.show) }),
  info: () => ({
    url: location.href,
    title: document.title,
    visible: document.visibilityState === 'visible',
    focused: document.hasFocus(),
    clock: clock.status(),
    net: net.status(),
    recording: recording.on,
  }),
}

/** Runs the command `name`, as the dev server's relay and MCP do. */
// oxlint-disable-next-line typescript/require-await -- the relay awaits this: an unknown name has to come back as a rejection, not a throw at the call
export async function run(name: string, args: unknown = {}) {
  const fn = commands[name]
  if (!fn) throw new Error(`unknown command ${name}: ${Object.keys(commands).join(', ')}`)
  return (fn as (a: unknown) => unknown)(args ?? {})
}

type Page = Window & { __weft_agent__?: boolean; __weft__?: object }

if (typeof window !== 'undefined' && !(window as Page).__weft_agent__) {
  ;(window as Page).__weft_agent__ = true
  getConfig() // the queries are configured once, like @weft-js/core/test's
  patchNetwork()
  patchConsole()
  listen(recording, () => quiet, log, describeFor)
  if (sessionStorage.getItem('weft:clock') === 'paused') install()
  const api = { snapshot, act, assert, record, clock, net, run, commands, within, version: 1 }
  ;(window as Page).__weft__ = Object.assign((window as Page).__weft__ ?? {}, { agent: api })
  // The dev server relays `weft browser` and MCP commands to this tab over Vite's own socket (vite.mjs).
  const hot = (
    import.meta as {
      hot?: {
        send(event: string, data: unknown): void
        on<T>(event: string, fn: (data: T) => void): void
      }
    }
  ).hot
  if (hot) {
    const tab = sessionStorage.getItem('weft:tab') ?? `t${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem('weft:tab', tab)
    const hello = () =>
      hot.send('weft:hello', {
        tab,
        url: location.href,
        title: document.title,
        visible: document.visibilityState === 'visible',
        focused: document.hasFocus(),
      })
    hello()
    addEventListener('focus', hello)
    document.addEventListener('visibilitychange', hello)
    hot.on('vite:ws:connect', hello)
    const relay = async (msg: { id: string; tab?: string; cmd: string; args: unknown }) => {
      if (msg.tab && msg.tab !== tab) return
      try {
        hot.send('weft:reply', { id: msg.id, tab, ok: true, result: await run(msg.cmd, msg.args) })
      } catch (e) {
        hot.send('weft:reply', { id: msg.id, tab, ok: false, error: (e as Error).message })
      }
    }
    hot.on('weft:cmd', (msg: Parameters<typeof relay>[0]) => void relay(msg))
  }
}
