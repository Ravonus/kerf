// weft/agent: drive and inspect the running app from inside the page, in whatever browser the agent already has
// (Claude's browser pane, Claude in Chrome, Codex's browser, a headless Chrome). Dev builds only; the weft() Vite
// plugin loads it when serving. Two ways in, one implementation:
//
//   - the agent's own browser runs JS: `await __weft__.agent.snapshot()`, `await __weft__.agent.act({ role: 'button', name: 'Add' }, 'click')`
//   - `weft browser …` / the `weft mcp` browser tools: the dev server relays each command to the open tab (vite.mjs)
//
// Queries and actions are weft/test's own (Testing Library role/label/text queries, user-event), so what an agent does
// here records straight into a `weft/test` test. Snapshots are the page's roles and names with refs, plus the reactive
// graph with real names (weft/devtools). The clock and the network are faked in the page, like weft/test's `clock` and
// `net`, for reconnect and timeout scenarios.

import { getConfig, screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { computeAccessibleName, getRole, isInaccessible } from 'dom-accessibility-api'
import { flush as flushGraph } from './index'
import { errors, format, graph, overlay, set } from './devtools'

// Real timers, saved before the fake clock can replace them: the bridge itself always runs on real time.
const real = {
  setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis), clearInterval: globalThis.clearInterval.bind(globalThis),
  requestAnimationFrame: globalThis.requestAnimationFrame?.bind(globalThis), cancelAnimationFrame: globalThis.cancelAnimationFrame?.bind(globalThis),
  Date: globalThis.Date, now: performance.now.bind(performance), fetch: globalThis.fetch?.bind(globalThis),
  WebSocket: globalThis.WebSocket, EventSource: globalThis.EventSource,
}
const sleep = (ms: number) => new Promise<void>(r => real.setTimeout(r, ms))

/** Let the app settle: weft's queue, microtasks, then one real task. */
async function settle() {
  for (let i = 0; i < 3; i++) { await Promise.resolve(); flushGraph() }
  await sleep(0)
  flushGraph()
}

// ---- targets: what the user sees ---------------------------------------------------------------------------------

/** `{ role, name }` (name exact unless `exact: false`), `{ label }`, `{ text }`, or a snapshot ref `'@e12'`. */
export type Target = string | { role: string; name?: string; exact?: boolean } | { label: string; exact?: boolean } | { text: string; exact?: boolean }

const refs = new Map<string, WeakRef<Element>>()
const refOf = new WeakMap<Element, string>()
let nextRef = 0

function ref(el: Element) {
  let r = refOf.get(el)
  if (!r) { r = `e${++nextRef}`; refOf.set(el, r); refs.set(r, new WeakRef(el)) }
  return r
}

const describe = (t: Target) => typeof t === 'string' ? t : 'role' in t ? `${t.role}${t.name !== undefined ? ` "${t.name}"` : ''}` : 'label' in t ? `label "${t.label}"` : `text "${t.text}"`

function findAll(t: Target): Element[] {
  if (typeof t === 'string') {
    const el = refs.get(t.replace(/^@/, ''))?.deref()
    return el?.isConnected ? [el] : []
  }
  if ('role' in t) return screen.queryAllByRole(t.role as any, t.name === undefined ? {} : { name: t.exact === false ? (n: string) => n.includes(t.name!) : t.name })
  if ('label' in t) return screen.queryAllByLabelText(t.label, { exact: t.exact ?? true })
  return screen.queryAllByText(t.text, { exact: t.exact ?? true })
}

function find(t: Target): Element {
  const all = findAll(t)
  if (all.length === 1) return all[0]
  if (!all.length) throw new Error(`nothing matches ${describe(t)}${typeof t === 'string' ? ' (refs come from the latest snapshot)' : ''}. Take a snapshot to see the roles and names on the page`)
  throw new Error(`${all.length} elements match ${describe(t)}: ${all.slice(0, 5).map(e => `@${ref(e)}`).join(', ')}. Use a ref, or narrow the name`)
}

// ---- snapshot ------------------------------------------------------------------------------------------------------

const interactive = new Set(['button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch', 'slider', 'spinbutton', 'treeitem'])
const landmarks = new Set(['heading', 'dialog', 'alert', 'alertdialog', 'status', 'list', 'listitem', 'table', 'row', 'cell', 'navigation', 'main', 'form', 'region', 'tabpanel', 'img', 'progressbar', 'log', 'group', 'article', 'banner', 'contentinfo', 'columnheader', 'rowheader', 'grid', 'gridcell', 'menu', 'menubar', 'tablist', 'tree', 'radiogroup', 'search', 'paragraph', 'meter'])

export interface SnapshotOptions {
  /** Only interactive elements (and nothing else): the smallest tree to act from. */
  interactive?: boolean
  /** A subtree: a target (`{ role: 'list', name: 'Products' }`) or a ref. */
  scope?: Target
  /** Return only the lines that changed since the previous snapshot. */
  delta?: boolean
  /** `false`: no graph; `'only'`: only the graph. A string other than 'only' filters it by name (`'Cart'`). */
  graph?: boolean | 'only' | string
}

let last: string[] = []

function states(el: Element, role: string) {
  const out: string[] = []
  const h = el as HTMLInputElement
  if (role === 'heading') out.push(`level=${/^H(\d)$/.exec(el.tagName)?.[1] ?? el.getAttribute('aria-level') ?? 2}`)
  if ('disabled' in h && h.disabled || el.getAttribute('aria-disabled') === 'true') out.push('disabled')
  if (role === 'checkbox' || role === 'radio' || role === 'switch') out.push(h.checked || el.getAttribute('aria-checked') === 'true' ? 'checked' : 'unchecked')
  if (el.getAttribute('aria-expanded')) out.push(`expanded=${el.getAttribute('aria-expanded')}`)
  if (el.getAttribute('aria-selected') === 'true') out.push('selected')
  if (el.getAttribute('aria-pressed')) out.push(`pressed=${el.getAttribute('aria-pressed')}`)
  if (el.getAttribute('aria-invalid') === 'true') out.push('invalid')
  if (document.activeElement === el && el !== document.body) out.push('focused')
  return out
}

function valueOf(el: Element, role: string) {
  if (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) return el.value
  if (el instanceof HTMLTextAreaElement) return el.value
  if (el instanceof HTMLSelectElement) return [...el.selectedOptions].map(o => o.text).join(', ')
  if (role === 'slider' || role === 'spinbutton' || role === 'progressbar' || role === 'meter') return el.getAttribute('aria-valuetext') ?? el.getAttribute('aria-valuenow') ?? undefined
  return undefined
}

const ownText = (el: Element) => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent!.trim()).filter(Boolean).join(' ')
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** The page as roles and names, one line each, indented by nesting: `- button "Add Banana" [ref=e5]`. */
function tree(root: Element, onlyInteractive: boolean) {
  const lines: string[] = []
  const walk = (el: Element, depth: number) => {
    if (el.hasAttribute('data-weft-devtools')) return
    if (el instanceof HTMLElement && (el.hidden || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEMPLATE')) return
    if (isInaccessible(el)) return
    const role = getRole(el) ?? ''
    const keep = onlyInteractive ? interactive.has(role) : interactive.has(role) || landmarks.has(role)
    let next = depth
    if (keep) {
      const name = computeAccessibleName(el)
      const value = valueOf(el, role)
      const st = states(el, role)
      const text = !onlyInteractive && !name && !interactive.has(role) ? ownText(el) : ''
      lines.push(`${'  '.repeat(depth)}- ${role}${name ? ` ${JSON.stringify(clip(name))}` : ''}${value !== undefined ? ` value=${JSON.stringify(clip(value))}` : ''}${st.length ? ` [${st.join(', ')}]` : ''} [ref=${ref(el)}]${text ? `: ${clip(text)}` : ''}`)
      next = depth + 1
      if (interactive.has(role)) return // a control's name already says what's inside it
    } else if (!onlyInteractive) {
      const text = ownText(el)
      if (text && !['OPTION'].includes(el.tagName)) lines.push(`${'  '.repeat(depth)}- text: ${clip(text)}`)
    }
    for (const c of el.children) walk(c, next)
  }
  walk(root, 0)
  return lines
}

/** Lines of `b` that are new since `a` (by content, in order), with removed lines as `- removed: …`. */
function diff(a: string[], b: string[]) {
  const strip = (l: string) => l.trim()
  const before = new Map<string, number>()
  for (const l of a) before.set(strip(l), (before.get(strip(l)) ?? 0) + 1)
  const out: string[] = []
  for (const l of b) {
    const k = strip(l)
    const n = before.get(k) ?? 0
    if (n) before.set(k, n - 1)
    else out.push(`+ ${k}`)
  }
  for (const [k, n] of before) for (let i = 0; i < n; i++) out.push(`- ${k}`)
  return out
}

export async function snapshot(options: SnapshotOptions = {}) {
  await settle()
  const root = options.scope ? find(options.scope) : document.body
  const result: Record<string, unknown> = { url: location.pathname + location.search + location.hash, title: document.title }
  if (options.graph !== 'only') {
    const lines = tree(root, !!options.interactive)
    if (options.delta) result.delta = diff(last, lines).join('\n') || '(no change)'
    else result.tree = lines.join('\n')
    if (!options.scope && !options.interactive) last = lines
  }
  if (options.graph !== false) {
    const nodes = graph(typeof options.graph === 'string' && options.graph !== 'only' ? options.graph : undefined)
    result.graph = format(nodes)
  }
  const errs = errors()
  if (errs.length) result.errors = errs
  if (consoleLog.length) result.console = consoleLog.splice(0)
  return result
}

// ---- act and assert -----------------------------------------------------------------------------------------------

export type Action = 'click' | 'dblclick' | 'hover' | 'focus' | 'clear' | 'fill' | 'type' | 'press' | 'select' | 'check' | 'uncheck'

const user = userEvent.setup({ delay: null, document })

/** Act on one element like a user (user-event), then let the app settle. Returns what changed on the page. */
export async function act(target: Target, action: Action, value?: string) {
  const el = find(target)
  const before = tree(document.body, false)
  quiet = true
  try {
    switch (action) {
      case 'click': await user.click(el); break
      case 'dblclick': await user.dblClick(el); break
      case 'hover': await user.hover(el); break
      case 'focus': (el as HTMLElement).focus(); break
      case 'clear': await user.clear(el); break
      case 'fill': await user.clear(el); if (value) await user.type(el, value); break
      case 'type': await user.type(el, value ?? ''); break
      case 'press': (el as HTMLElement).focus(); await user.keyboard(value ?? '{Enter}'); break
      case 'select': await user.selectOptions(el, value ?? ''); break
      case 'check': if (!(el as HTMLInputElement).checked) await user.click(el); break
      case 'uncheck': if ((el as HTMLInputElement).checked) await user.click(el); break
      default: throw new Error(`unknown action ${action}: click, dblclick, hover, focus, clear, fill, type, press, select, check, uncheck`)
    }
    await settle()
  } finally { quiet = false }
  log({ kind: 'act', target: describeFor(el, target), action, value })
  const after = tree(document.body, false)
  last = after
  return { ok: true, target: `@${ref(el)}`, changes: diff(before, after).join('\n') || '(no visible change)', errors: errors() }
}

/**
 * What an assertion checks, in weft/test's words: `visible`, `absent`, `text` (contains), `exactText`, `value`,
 * `checked`, `unchecked`, `disabled`, `enabled`, `focused`, `count`.
 */
export type Expectation = { visible: true } | { absent: true } | { text: string } | { exactText: string } | { value: string } | { checked: true } | { unchecked: true } | { disabled: true } | { enabled: true } | { focused: true } | { count: number }

function check(target: Target, e: Expectation): { ok: boolean; actual: unknown } {
  if ('absent' in e) { const n = findAll(target).length; return { ok: n === 0, actual: `${n} found` } }
  if ('count' in e) { const n = findAll(target).length; return { ok: n === e.count, actual: n } }
  const all = findAll(target)
  if (all.length !== 1) return { ok: false, actual: `${all.length} found` }
  const el = all[0] as HTMLInputElement
  if ('visible' in e) return { ok: true, actual: 'present' }
  if ('text' in e) return { ok: (el.textContent ?? '').includes(e.text), actual: clip(el.textContent?.trim() ?? '', 200) }
  if ('exactText' in e) return { ok: (el.textContent ?? '').trim() === e.exactText, actual: clip(el.textContent?.trim() ?? '', 200) }
  if ('value' in e) return { ok: el.value === e.value, actual: el.value }
  if ('checked' in e) return { ok: !!el.checked, actual: el.checked }
  if ('unchecked' in e) return { ok: !el.checked, actual: el.checked }
  if ('disabled' in e) return { ok: !!el.disabled, actual: el.disabled }
  if ('enabled' in e) return { ok: !el.disabled, actual: el.disabled ? 'disabled' : 'enabled' }
  if ('focused' in e) return { ok: document.activeElement === el, actual: document.activeElement === el }
  throw new Error(`unknown expectation ${JSON.stringify(e)}`)
}

/** Check what the user sees, retrying on real time for up to `timeout` ms (async loads). Recorded for `record`. */
export async function assert(target: Target, expectation: Expectation, { timeout = 1500 } = {}) {
  const until = real.now() + timeout
  let r = check(target, expectation)
  while (!r.ok && real.now() < until) { await sleep(25); flushGraph(); r = check(target, expectation) }
  if (r.ok) {
    const el = findAll(target)[0]
    log({ kind: 'assert', target: el ? describeFor(el, target) : target, expectation })
  }
  return { ok: r.ok, target: describe(target), expected: expectation, actual: r.actual }
}

// ---- recorder ------------------------------------------------------------------------------------------------------

type Query = { by: 'role'; role: string; name?: string } | { by: 'label'; label: string } | { by: 'text'; text: string } | { by: 'ref'; ref: string }
type Step =
  | { kind: 'act'; target: Query; action: Action; value?: string }
  | { kind: 'assert'; target: Query | Target; expectation: Expectation }
  | { kind: 'clock'; op: 'install' | 'advance' | 'uninstall'; ms?: number }
  | { kind: 'net'; op: 'offline' | 'online' }
  | { kind: 'note'; text: string }

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
    if (screen.queryAllByRole(role as any, name ? { name } : {}).length === 1) return name ? { by: 'role', role, name } : { by: 'role', role }
  }
  const labels = (el as HTMLInputElement).labels
  const label = labels?.[0]?.textContent?.trim()
  if (label && screen.queryAllByLabelText(label).length === 1) return { by: 'label', label }
  const text = el.textContent?.trim()
  if (text && text.length < 80 && screen.queryAllByText(text).length === 1) return { by: 'text', text }
  if (given && typeof given !== 'string') return 'role' in given ? { by: 'role', role: given.role, name: given.name } : 'label' in given ? { by: 'label', label: given.label } : { by: 'text', text: given.text }
  return { by: 'ref', ref: ref(el) }
}

// What people (or an agent's own browser tool) do on the page, as steps. Typing coalesces into one `fill`.
function listen() {
  const target = (e: Event) => (e.target instanceof Element && !e.target.closest('[data-weft-devtools]') ? e.target : null)
  addEventListener('click', e => {
    const el = target(e)
    if (quiet || !el || !recording.on) return
    const control = el.closest('button, a, input, select, textarea, [role], label, summary') ?? el
    if (control instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(control.type)) return
    if (control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) return
    log({ kind: 'act', target: describeFor(control), action: 'click' })
  }, true)
  addEventListener('input', e => {
    const el = target(e)
    if (quiet || !el || !recording.on || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || ['checkbox', 'radio'].includes((el as HTMLInputElement).type)) return
    const q = describeFor(el)
    const prev = recording.steps.at(-1)
    if (prev?.kind === 'act' && prev.action === 'fill' && JSON.stringify(prev.target) === JSON.stringify(q)) prev.value = el.value
    else log({ kind: 'act', target: q, action: 'fill', value: el.value })
  }, true)
  addEventListener('change', e => {
    const el = target(e)
    if (quiet || !el || !recording.on || !(el instanceof HTMLSelectElement)) return
    log({ kind: 'act', target: describeFor(el), action: 'select', value: el.value })
  }, true)
  addEventListener('keydown', e => {
    const el = target(e)
    if (quiet || !el || !recording.on || !['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    log({ kind: 'act', target: describeFor(el), action: 'press', value: `{${e.key}}` })
  }, true)
}

const q = (t: Query | Target): string => {
  const s = JSON.stringify
  if (typeof t === 'string') return `/* ${t}: no role, label or text identifies it; give it an accessible name */ screen.getByRole('generic')`
  if ('by' in t) {
    if (t.by === 'role') return `screen.getByRole(${s(t.role)}${t.name ? `, { name: ${s(t.name)} }` : ''})`
    if (t.by === 'label') return `screen.getByLabelText(${s(t.label)})`
    if (t.by === 'text') return `screen.getByText(${s(t.text)})`
    return `/* @${t.ref}: no role, label or text identifies it; give it an accessible name */ screen.getByRole('generic')`
  }
  if ('role' in t) return `screen.getByRole(${s(t.role)}${t.name ? `, { name: ${s(t.name)} }` : ''})`
  if ('label' in t) return `screen.getByLabelText(${s(t.label)})`
  return `screen.getByText(${s(t.text)})`
}

export interface CodeOptions {
  /** The component the test renders (default `App`), and where it comes from (default `./App`). */
  component?: string
  from?: string
  /** Props as source text (`{ api: createFakeApi() }`), and extra import lines they need. */
  props?: string
  imports?: string[]
  name?: string
}

/** The recorded steps as a `weft/test` test: role/label/text queries, user actions, clock and net, real assertions. */
export function code(steps: Step[] = recording.steps, o: CodeOptions = {}) {
  const comp = o.component ?? 'App'
  const used = new Set(['render', 'screen'])
  const body: string[] = []
  let first = true
  let asserts = 0
  const get = (t: Query | Target) => {
    const g = q(t)
    if (!first || g.startsWith('/*')) return g
    first = false
    return `await ${g.replace('screen.getBy', 'screen.findBy')}` // the first query waits for the app to load
  }
  for (const st of steps) {
    if (st.kind === 'act') {
      used.add('user')
      const el = get(st.target)
      const v = JSON.stringify(st.value ?? '')
      if (st.action === 'fill') body.push(`await user.clear(${el})`, `await user.type(${q(st.target)}, ${v})`)
      else if (st.action === 'press') body.push(`${el.startsWith('await') ? `${el.replace(/^await /, '(await ')}).focus()` : `${el}.focus()`}`, `await user.keyboard(${v})`)
      else if (st.action === 'select') body.push(`await user.selectOptions(${el}, ${v})`)
      else if (st.action === 'type') body.push(`await user.type(${el}, ${v})`)
      else if (st.action === 'check' || st.action === 'uncheck' || st.action === 'click') body.push(`await user.click(${el})`)
      else if (st.action === 'dblclick') body.push(`await user.dblClick(${el})`)
      else if (st.action === 'hover') body.push(`await user.hover(${el})`)
      else if (st.action === 'clear') body.push(`await user.clear(${el})`)
      else if (st.action === 'focus') body.push(`${el}.focus()`)
    } else if (st.kind === 'assert') {
      asserts++
      const e = st.expectation as any
      const el = get(st.target)
      const one = el.startsWith('await') ? `(${el})` : el
      const all = q(st.target).replace('screen.getBy', 'screen.queryAllBy')
      if ('absent' in e) body.push(`expect(${q(st.target).replace('screen.getBy', 'screen.queryBy')}).toBeNull()`)
      else if ('count' in e) body.push(`expect(${all}).toHaveLength(${e.count})`)
      else if ('visible' in e) body.push(`expect(${one}).toBeTruthy()`)
      else if ('text' in e) body.push(`expect(${one}.textContent).toContain(${JSON.stringify(e.text)})`)
      else if ('exactText' in e) body.push(`expect(${one}.textContent?.trim()).toBe(${JSON.stringify(e.exactText)})`)
      else if ('value' in e) body.push(`expect((${one} as HTMLInputElement).value).toBe(${JSON.stringify(e.value)})`)
      else if ('checked' in e || 'unchecked' in e) body.push(`expect((${one} as HTMLInputElement).checked).toBe(${'checked' in e})`)
      else if ('disabled' in e || 'enabled' in e) body.push(`expect((${one} as HTMLButtonElement).disabled).toBe(${'disabled' in e})`)
      else if ('focused' in e) body.push(`expect(document.activeElement).toBe(${one})`)
    } else if (st.kind === 'clock') {
      used.add('clock')
      if (st.op === 'install') body.push('clock.install()')
      else if (st.op === 'advance') body.push(`await clock.advance(${st.ms})`)
    } else if (st.kind === 'net') { used.add('net'); body.push(`await net.${st.op}()`) }
    else if (st.kind === 'note') body.push(`// ${st.text}`)
  }
  // Paused from the start (`record start` with the clock paused): install before render, like the page did.
  const renderAt = body[0] === 'clock.install()' && steps[0]?.kind === 'clock' ? 1 : 0
  body.splice(renderAt, 0, `render(${comp}${o.props ? `, ${o.props}` : ''})`)
  const lines = [
    `import { expect, test } from 'vitest'`,
    `import { ${[...used].sort().join(', ')} } from 'weft/test'`,
    `import { ${comp} } from ${JSON.stringify(o.from ?? `./${comp}`)}`,
    ...(o.imports ?? []),
    '',
    `test(${JSON.stringify(o.name ?? `recorded: ${location.pathname}`)}, async () => {`,
    ...body.map(l => `  ${l}`),
    ...(asserts ? [] : ['  // T001: nothing was asserted while recording. Add what the user should see, or the gate rejects this test']),
    '})',
    '',
  ]
  return { code: lines.join('\n'), steps: steps.length, asserts }
}

export const record = {
  start() { recording.on = true; recording.steps = []; if (clock.status().installed) log({ kind: 'clock', op: 'install' }); return { recording: true } },
  stop() { recording.on = false; return { recording: false, steps: recording.steps.length } },
  steps: () => recording.steps.slice(),
  code: (o: CodeOptions = {}) => code(recording.steps, o),
  note(text: string) { log({ kind: 'note', text }); return { ok: true } },
}

// ---- clock ---------------------------------------------------------------------------------------------------------

type Timer = { id: number; at: number; fn: Function; args: unknown[]; every?: number }
const timers = new Map<number, Timer>()
let fakeNow = 0
let installedAt = 0
let nextTimer = 1
let installed = false

const g = globalThis as any

/**
 * The page's clock, faked like weft/test's `clock`: `pause()` stops time for timers, intervals, rAF, `Date` and
 * `performance.now`; `advance(ms)` runs what falls due, in order; `resume()` hands pending timers back to real time.
 * Timers scheduled before `pause()` stay on real time: pass `{ reload: true }` to pause from the next page load.
 */
export const clock = {
  status: () => ({ installed, now: installed ? fakeNow : real.Date.now(), pending: timers.size }),
  pause({ reload = false } = {}) {
    if (reload) { sessionStorage.setItem('weft:clock', 'paused'); real.setTimeout(() => location.reload(), 0); return { reloading: true } }
    install()
    log({ kind: 'clock', op: 'install' })
    return clock.status()
  },
  async advance(ms: number) {
    if (!installed) throw new Error('the clock is running on real time: `time pause` first')
    const end = fakeNow + ms
    for (;;) {
      const due = [...timers.values()].filter(t => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) break
      fakeNow = due.at
      if (due.every) due.at += due.every
      else timers.delete(due.id)
      try { due.fn(...due.args) } catch (e) { real.setTimeout(() => { throw e }, 0) }
      await settle()
    }
    fakeNow = end
    await settle()
    log({ kind: 'clock', op: 'advance', ms })
    return clock.status()
  },
  resume() {
    if (!installed) return clock.status()
    uninstall()
    sessionStorage.removeItem('weft:clock')
    return clock.status()
  },
}

function install() {
  if (installed) return
  installed = true
  fakeNow = real.Date.now()
  installedAt = real.now()
  const add = (fn: Function, ms = 0, args: unknown[], every?: number) => {
    const id = nextTimer++
    timers.set(id, { id, at: fakeNow + Math.max(0, ms), fn, args, every: every === undefined ? undefined : Math.max(1, every) })
    return id
  }
  g.setTimeout = (fn: Function, ms?: number, ...args: unknown[]) => add(fn, ms, args)
  g.setInterval = (fn: Function, ms?: number, ...args: unknown[]) => add(fn, ms, args, ms ?? 0)
  g.clearTimeout = g.clearInterval = (id: number) => { timers.delete(id) }
  g.requestAnimationFrame = (fn: FrameRequestCallback) => add(() => fn(performance.now()), 16, [])
  g.cancelAnimationFrame = (id: number) => { timers.delete(id) }
  const RealDate = real.Date
  g.Date = class extends RealDate {
    constructor(...args: any[]) { super(...((args.length ? args : [fakeNow]) as [])) }
    static now() { return fakeNow }
  }
  const from = fakeNow
  performance.now = () => installedAt + (fakeNow - from)
}

function uninstall() {
  installed = false
  Object.assign(g, { setTimeout: real.setTimeout, setInterval: real.setInterval, clearTimeout: real.clearTimeout, clearInterval: real.clearInterval, Date: real.Date })
  if (real.requestAnimationFrame) Object.assign(g, { requestAnimationFrame: real.requestAnimationFrame, cancelAnimationFrame: real.cancelAnimationFrame })
  performance.now = real.now
  // Pending fake timers continue on real time with what was left of their delay. Their ids change.
  for (const t of timers.values()) {
    const left = Math.max(0, t.at - fakeNow)
    if (t.every) real.setTimeout(() => { t.fn(...t.args); real.setInterval(() => t.fn(...t.args), t.every) }, left)
    else real.setTimeout(() => t.fn(...t.args), left)
  }
  timers.clear()
}

// ---- network -------------------------------------------------------------------------------------------------------

const sockets = new Set<WebSocket | EventSource>()
const netState = { online: true, latency: 0 }

/**
 * The network as the app sees it: `offline()` makes `navigator.onLine` false, fires `offline`, fails `fetch` and new
 * sockets, and drops open WebSockets and EventSources; `latency(ms)` delays every `fetch`; `drop()` closes the open
 * sockets without going offline (a server restart). Same words as weft/test's `net`. The dev server's own socket is
 * never touched.
 */
export const net = {
  status: () => ({ ...netState, sockets: sockets.size }),
  async offline() {
    netState.online = false
    net.drop()
    dispatchEvent(new Event('offline'))
    await settle()
    log({ kind: 'net', op: 'offline' })
    return net.status()
  },
  async online() {
    netState.online = true
    dispatchEvent(new Event('online'))
    await settle()
    log({ kind: 'net', op: 'online' })
    return net.status()
  },
  latency(ms: number) { netState.latency = Math.max(0, ms); return net.status() },
  drop() {
    for (const s of sockets) {
      if (s instanceof real.WebSocket) s.close(4000, 'weft: connection dropped')
      else { (s as EventSource).close(); s.dispatchEvent(new Event('error')) }
    }
    sockets.clear()
    return net.status()
  },
  reset() { netState.online = true; netState.latency = 0; return net.status() },
}

function patchNetwork() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => netState.online })
  if (real.fetch)
    g.fetch = async (...args: Parameters<typeof fetch>) => {
      if (netState.latency) await sleep(netState.latency)
      if (!netState.online) throw new TypeError('Failed to fetch (weft: offline)')
      return real.fetch(...args)
    }
  if (real.WebSocket)
    g.WebSocket = class extends real.WebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        if (!netState.online) { real.setTimeout(() => { this.dispatchEvent(new Event('error')); this.close(4000, 'weft: offline') }, 0); return }
        sockets.add(this)
        this.addEventListener('close', () => sockets.delete(this))
      }
    }
  if (real.EventSource)
    g.EventSource = class extends real.EventSource {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init)
        if (!netState.online) { real.setTimeout(() => { this.close(); this.dispatchEvent(new Event('error')) }, 0); return }
        sockets.add(this)
      }
    }
}

// ---- console -------------------------------------------------------------------------------------------------------

const consoleLog: { level: string; text: string }[] = []
function patchConsole() {
  for (const level of ['error', 'warn'] as const) {
    const orig = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      if (consoleLog.length < 200) consoleLog.push({ level, text: args.map(a => (typeof a === 'string' ? a : a instanceof Error ? a.message : safe(a))).join(' ').slice(0, 500) })
      orig(...args)
    }
  }
}
const safe = (v: unknown) => { try { return JSON.stringify(v) } catch { return String(v) } }

// ---- the bridge ----------------------------------------------------------------------------------------------------

/** Every command the dev server relays, by name; each returns JSON. */
export const commands: Record<string, (args: any) => unknown> = {
  snapshot: (a: SnapshotOptions) => snapshot(a),
  act: (a: { target: Target; action: Action; value?: string }) => act(a.target, a.action, a.value),
  assert: (a: { target: Target; expect: Expectation; timeout?: number }) => assert(a.target, a.expect, { timeout: a.timeout }),
  graph: (a: { filter?: string }) => { const nodes = graph(a.filter); return { graph: format(nodes), nodes } },
  set: (a: { name: string; value: unknown }) => set(a.name, a.value),
  navigate: (a: { to: string }) => { real.setTimeout(() => location.assign(a.to), 0); return { navigating: a.to } },
  reload: () => { real.setTimeout(() => location.reload(), 0); return { reloading: true } },
  time: (a: { op: 'pause' | 'advance' | 'resume' | 'status'; ms?: number; reload?: boolean }) =>
    a.op === 'pause' ? clock.pause({ reload: a.reload }) : a.op === 'advance' ? clock.advance(a.ms ?? 0) : a.op === 'resume' ? clock.resume() : clock.status(),
  net: (a: { op: 'offline' | 'online' | 'latency' | 'drop' | 'reset' | 'status'; ms?: number }) =>
    a.op === 'latency' ? net.latency(a.ms ?? 0) : a.op === 'status' ? net.status() : (net as any)[a.op](),
  record: (a: { op: 'start' | 'stop' | 'steps' | 'code' | 'note'; text?: string } & CodeOptions) =>
    a.op === 'code' ? record.code(a) : a.op === 'note' ? record.note(a.text ?? '') : (record as any)[a.op](),
  logs: () => ({ console: consoleLog.splice(0), errors: errors() }),
  overlay: (a: { show?: boolean }) => ({ shown: overlay(a.show) }),
  info: () => ({ url: location.href, title: document.title, visible: document.visibilityState === 'visible', focused: document.hasFocus(), clock: clock.status(), net: net.status(), recording: recording.on }),
}

export async function run(name: string, args: unknown = {}) {
  const fn = commands[name]
  if (!fn) throw new Error(`unknown command ${name}: ${Object.keys(commands).join(', ')}`)
  return fn(args ?? {})
}

if (typeof window !== 'undefined' && !(window as any).__weft_agent__) {
  ;(window as any).__weft_agent__ = true
  getConfig() // the queries are configured once, like weft/test's
  patchNetwork()
  patchConsole()
  listen()
  if (sessionStorage.getItem('weft:clock') === 'paused') install()
  const api = { snapshot, act, assert, record, clock, net, run, commands, within, version: 1 }
  ;(window as any).__weft__ = Object.assign((window as any).__weft__ ?? {}, { agent: api })
  // The dev server relays `weft browser` and MCP commands to this tab over Vite's own socket (vite.mjs).
  const hot = (import.meta as any).hot
  if (hot) {
    const tab = sessionStorage.getItem('weft:tab') ?? `t${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem('weft:tab', tab)
    const hello = () => hot.send('weft:hello', { tab, url: location.href, title: document.title, visible: document.visibilityState === 'visible', focused: document.hasFocus() })
    hello()
    addEventListener('focus', hello)
    document.addEventListener('visibilitychange', hello)
    hot.on('vite:ws:connect', hello)
    hot.on('weft:cmd', async (msg: { id: string; tab?: string; cmd: string; args: unknown }) => {
      if (msg.tab && msg.tab !== tab) return
      try { hot.send('weft:reply', { id: msg.id, tab, ok: true, result: await run(msg.cmd, msg.args) }) }
      catch (e) { hot.send('weft:reply', { id: msg.id, tab, ok: false, error: (e as Error).message }) }
    })
  }
}
