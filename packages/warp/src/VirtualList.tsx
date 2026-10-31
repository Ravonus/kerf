import { derived, DEV, effect, flush, onCleanup, onMount, state, untrack } from 'weft'
import { For } from 'weft/dom'
import { measureEngine, type MeasureHandle, type MeasureProvider } from 'weft/text'
import { slices, virtualizer, type VirtualAlign, type VirtualKey, type Virtualizer } from '@weft/ui-core'
import './styles'
import '@weft/ui-core/styles/data/virtual.css'

export interface VirtualControl {
  scrollTo(key: VirtualKey, align?: VirtualAlign): void
  scrollToEnd(): void
  /** Render the row, wherever it is, and move focus to it. */
  focus(key: VirtualKey): void
  /** Move focus by rows from the focused one. */
  move(by: number): void
  /** The key of the focused or last-focused row. */
  active(): VirtualKey | undefined
}

export interface VirtualListProps<T> {
  items: readonly T[]
  rowKey: (item: T) => VirtualKey
  children: (item: () => T, index: () => number) => any
  /** The list's name. */
  label?: string
  /** The row's text. Rows get exact heights before they render when the app has `text.measure`, and it's measured otherwise. */
  text?: (item: T) => string | null | undefined
  /** Rows that look different around the same text: each gets its own measurement of everything but the text. */
  variant?: (item: T) => string
  /** A row's height before it's known. Default 48. */
  estimate?: number
  /** Pixels between rows. */
  gap?: number
  overscan?: number
  /** Rows on the server and in the first paint. Default 20. */
  initial?: number
  /** Stay at the end as rows arrive while the user is within this many pixels of it. */
  stick?: number
  from?: 'start' | 'end'
  /** `list` by default; `feed`, `log` and the rest bring their own row role. */
  role?: string
  rowRole?: string
  /** Keep this role off the scroller and put it on the list inside. */
  inner?: boolean
  tag?: 'div' | 'ol'
  /** Row keys move focus: ↑/↓, Home/End, one tab stop on the rows. */
  roving?: boolean
  /** The total isn't the list's to know (a log with history to load): `aria-setsize` is -1, and an arrival writes no row. */
  open?: boolean
  /** On a key the list doesn't use. */
  onRowKey?: (e: KeyboardEvent, control: VirtualControl) => void
  onStart?: () => void
  onEnd?: () => void
  onStick?: (stuck: boolean) => void
  onDrift?: (index: number, predicted: number, actual: number) => void
  control?: (c: VirtualControl) => void
  scope?: string
  part?: string
  listScope?: string
  height?: string
  /** `aria-busy`: more is loading. */
  busy?: boolean
  class?: string
}

interface Metric { font: string; line: number; wrap: number; chrome: number; opts: { whiteSpace?: 'normal' | 'pre-wrap'; letterSpacing?: number } }
const EDGE = 8 // rows from the end at which onStart and onEnd ask for more
const BATCH = 256 // rows prepared between index updates
const LONG = 'mmmm '.repeat(400)

function fontOf(c: CSSStyleDeclaration) {
  return `${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`
}

/** One row's text and everything around it, read from a real hidden row: nothing here knows warp's padding. */
function metricOf(probe: HTMLElement): Metric | undefined {
  const box = probe.querySelector<HTMLElement>('[data-measure]')
  if (!box) return
  const c = getComputedStyle(box)
  const line = parseFloat(c.lineHeight)
  if (!line) return // `normal` has no one answer
  box.style.display = 'block'
  box.textContent = 'x'
  const chrome = probe.getBoundingClientRect().height - line
  box.textContent = LONG
  const wrap = box.getBoundingClientRect().width - (parseFloat(c.paddingInlineStart) || 0) - (parseFloat(c.paddingInlineEnd) || 0)
  const white = c.whiteSpaceCollapse === 'preserve' || /pre/.test(c.whiteSpace)
  return { font: fontOf(c), line, wrap, chrome, opts: { whiteSpace: white ? 'pre-wrap' : 'normal', letterSpacing: parseFloat(c.letterSpacing) || undefined } }
}

/**
 * A long list (06 §9): one window of rows at known offsets. Give it `text` and rows have exact heights before they
 * exist; rows the engine can't size are measured when they render, and what's on screen never moves when one corrects.
 */
export function VirtualList<T>(props: VirtualListProps<T>) {
  let el: HTMLElement | undefined, list: HTMLElement | undefined
  let v: Virtualizer | undefined
  let engine: MeasureProvider | null = null
  let stop: (() => void) | undefined
  let measuredAt = -1
  let slicing = false, cursor = 0 // what the idle pass has reached: a change behind it is prepared now, ahead of it later
  const waiting: [HTMLElement, VirtualKey, (undo: () => void) => void][] = []
  const metrics = new Map<string, Metric>()
  const prepared = new Map<VirtualKey, { text: string; handle: MeasureHandle; font: string }>()
  const probes = new Map<string, HTMLElement>()
  const active = state<VirtualKey | undefined>(undefined)
  const pending = state<VirtualKey | undefined>(undefined)

  const items = derived(() => props.items)
  const keyOf = (item: T) => props.rowKey(item)
  const keys = derived(() => items.value.map(keyOf))
  const variantOf = (item: T) => props.variant?.(item) ?? ''
  const first = untrack(() => {
    const n = items.value.length, count = Math.min(n, props.initial ?? 20)
    return Array.from({ length: count }, (_, i) => (props.from === 'end' ? n - count + i : i))
  })
  // Keys, not indices: a prepend renumbers every row, and that mustn't look like a new set of rows.
  const shown = state<VirtualKey[]>(untrack(() => first.map(i => keyOf(items.value[i]))))
  const index = derived(() => new Map(keys.value.map((k, i) => [k, i])))
  const rows = derived(() => {
    const all = items.value, at = index.value
    return shown.value.flatMap(key => { const i = at.get(key); return i === undefined ? [] : [{ item: all[i], i, key }] })
  })

  const samples = derived(() => {
    if (!props.text) return []
    const seen = new Map<string, T>()
    for (const item of items.value) {
      const name = variantOf(item)
      if (!seen.has(name)) seen.set(name, item)
      if (!props.variant) break
    }
    return [...seen]
  })
  const probing = state(false)

  function prepare(i: number) {
    const item = untrack(() => items.value[i]), m = metrics.get(variantOf(item)), value = props.text?.(item)
    if (!engine || !m || value == null) return false
    const key = keyOf(item), had = prepared.get(key)
    if (had && had.text === value && had.font === m.font) return false
    // Preserved white space leaves the fast tier, so it's asked for only by text that has some to preserve.
    const handle = engine.prepare(value, m.font, m.opts.whiteSpace === 'pre-wrap' && !/\n| {2}|\t/.test(value) ? { ...m.opts, whiteSpace: 'normal' } : m.opts)
    prepared.set(key, { text: value, handle, font: m.font })
    handle.ready?.then(() => { const at = index.value.get(key); if (at !== undefined) v?.refresh(at, at + 1) })
    return true
  }

  const size = (i: number) => {
    if (!engine) return
    const item = items.value[i], m = metrics.get(variantOf(item)), p = prepared.get(keyOf(item))
    if (!m || !p || p.text !== props.text?.(item)) return
    return m.chrome + Math.max(m.line, engine.layout(p.handle, m.wrap, m.line).height)
  }

  function calibrate() {
    metrics.clear()
    for (const [name, probe] of probes) {
      const m = metricOf(probe)
      if (m) metrics.set(name, m)
    }
    measuredAt = list?.getBoundingClientRect().width ?? -1
  }

  /** The window now, so it paints exact; the rest a few ms at a time, so 10,000 rows never block a frame. */
  function prepareAll() {
    stop?.()
    slicing = true
    cursor = 0
    for (const key of shown.value) { const i = index.value.get(key); if (i !== undefined) prepare(i) }
    v?.refresh()
    let lo = 0, done = 0
    stop = slices(() => {
      if (cursor >= items.value.length) {
        slicing = false
        if (cursor > lo) v?.refresh(lo, cursor)
        return false
      }
      if (prepare(cursor++)) done++
      if (done >= BATCH) { v?.refresh(lo, cursor); lo = cursor; done = 0 }
      return true
    })
  }

  function start() {
    calibrate()
    prepareAll()
  }

  const fontsDone = () => { engine?.clear(); prepared.clear(); start() }
  const root = () => el!.ownerDocument.documentElement
  const dials = new MutationObserver(() => { calibrate(); prepareAll() })

  /** Bring a row into view if it isn't. Before its key has arrived this does nothing, and the keys effect comes back. */
  function reveal(key: VirtualKey) {
    const i = index.value.get(key)
    if (i === undefined || !v) return
    const a = v.anchor(), now = v.sizes.offset(a.index) + a.within, top = v.sizes.offset(i)
    if (top < now) v.scrollTo(i, 'start')
    else if (top + v.sizes.get(i) > now + el!.clientHeight) v.scrollTo(i, 'end')
  }

  const control: VirtualControl = {
    scrollTo(key, align) {
      const i = index.value.get(key)
      if (i !== undefined) v?.scrollTo(i, align)
    },
    scrollToEnd: () => v?.scrollToEnd(),
    focus(key) {
      active.value = key
      pending.value = key
      v?.update({})
      reveal(key)
    },
    move(by) {
      const all = keys.value, at = all.indexOf(active.value as VirtualKey)
      control.focus(all[Math.max(0, Math.min(all.length - 1, (at < 0 ? v!.anchor().index : at) + by))])
    },
    active: () => active.value,
  }

  function onKeyDown(e: KeyboardEvent) {
    if (props.roving && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const n = keys.value.length
      const to = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? -n : e.key === 'End' ? n : 0
      if (to && (e.target as HTMLElement).closest('[data-part="row"]') === e.target) {
        e.preventDefault()
        control.move(to)
        return
      }
    }
    props.onRowKey?.(e, control)
  }

  let askedStart = -1, askedEnd = -1
  function edges(indices: number[]) {
    const n = keys.value.length
    if (!n || !indices.length) return
    if (props.onEnd && indices.at(-1)! >= n - EDGE && askedEnd !== n) { askedEnd = n; props.onEnd() }
    if (props.onStart && indices[0] <= EDGE && askedStart !== n) { askedStart = n; props.onStart() }
  }

  onMount(() => {
    queueMicrotask(() => {
      if (!el) return
      v = virtualizer(el, {
        keys: untrack(() => keys.value), spacer: list!, estimate: untrack(() => props.estimate ?? 48), gap: untrack(() => props.gap), overscan: untrack(() => props.overscan),
        stick: untrack(() => props.stick), from: untrack(() => props.from), size: (i, width) => {
          if (width !== measuredAt && metrics.size) calibrate()
          return size(i)
        },
        pinned: () => (active.value === undefined ? [] : [active.value]),
        onRange: indices => { for (const i of indices) prepare(i); shown.value = indices.map(i => keys.value[i]); edges(indices) },
        onStick: s => props.onStick?.(s), onDrift: (i, p, a) => {
          props.onDrift?.(i, p, a)
          if (DEV && engine && Math.abs(p - a) > 1 && prepared.has(keys.value[i])) console.debug(`weft: X001 row ${i} predicted ${p}px and renders ${a}px`)
        },
      })
      for (const [row, key, keep] of waiting.splice(0)) keep(v.attach(row, key))
      effect(() => keys.value, k => {
        v!.update({ keys: k })
        const key = untrack(() => pending.value)
        if (key !== undefined) reveal(key)
      })
      effect(() => active.value, () => v!.update({}))
      untrack(() => props.control?.(control))
      if (!untrack(() => props.text)) return
      measureEngine().then(e => {
        if (!e || !el) return
        engine = e
        probing.value = true
        flush()
        start()
        effect(() => items.value, (_, prev) => {
          if (prev === undefined) return
          let lo = -1, hi = 0
          const to = slicing ? cursor : items.value.length
          for (let i = 0; i < to; i++) if (prepare(i)) { if (lo < 0) lo = i; hi = i + 1 }
          if (lo >= 0) v!.refresh(lo, hi)
        })
        effect(() => samples.value.length, () => { // a kind of row that wasn't here at the start
          if (untrack(() => samples.value.every(([name]) => metrics.has(name)))) return
          queueMicrotask(() => { calibrate(); prepareAll() })
        })
        document.fonts?.addEventListener?.('loadingdone', fontsDone)
        dials.observe(root(), { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-expression', 'data-density'] })
      })
    })
    onCleanup(() => {
      stop?.()
      dials.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', fontsDone)
      v?.destroy()
    })
  })

  function Row(p: { row: () => { item: T; i: number; key: VirtualKey } }) {
    let node: HTMLElement | undefined
    const key = untrack(() => p.row().key)
    onMount(() => {
      let undo: (() => void) | undefined
      const keep = (u: () => void) => (undo = u)
      if (v) keep(v.attach(node!, key))
      else waiting.push([node!, key, keep])
      onCleanup(() => undo?.())
      effect(() => pending.value === key, go => {
        if (!go) return
        pending.value = undefined
        ;(node!.querySelector<HTMLElement>('[data-focus]') ?? node!).focus()
      })
    })
    const index = () => p.row().i
    const place = untrack(() => `position:absolute;inset-inline:0;inset-block-start:0;transform:translateY(${index() * (props.estimate ?? 48)}px)`) // the first paint; the virtualizer owns it after
    const attrs = () => ({
      ref: (n: HTMLElement) => (node = n),
      'data-part': 'row',
      role: props.rowRole,
      'aria-posinset': index() + 1,
      'aria-setsize': props.open ? -1 : keys.value.length,
      tabindex: props.roving ? (active.value === key || (active.value === undefined && key === shown.value[0]) ? 0 : -1) : undefined,
      style: place,
      onFocusIn: () => { if (props.roving || props.rowRole === 'article') active.value = key },
    })
    const body = props.children(() => p.row().item, index)
    return props.tag === 'ol' ? <li {...attrs()}>{body}</li> : <div {...attrs()}>{body}</div>
  }

  const inner = untrack(() => props.inner)
  const listAttrs = () => ({
    ref: (n: HTMLElement) => (list = n),
    'data-part': 'spacer',
    'data-scope': props.listScope,
    role: inner ? props.role : props.tag === 'ol' ? undefined : props.rowRole ? 'presentation' : undefined,
    'aria-label': inner ? props.label : undefined,
    'aria-busy': inner && props.busy ? 'true' : undefined,
    style: 'position:relative;flex:none',
  })
  const rowsOut = () => <For each={rows.value} by={r => r.key}>{r => <Row row={r} />}</For>
  const probed = () => (probing.value
    ? <For each={samples.value} by={s => s[0]}>{s => {
      const name = untrack(() => s()[0])
      const body = props.children(() => s()[1], () => 0)
      const attrs = { ref: (n: HTMLElement) => probes.set(name, n), 'data-part': 'row', 'data-probe': '', 'aria-hidden': 'true', inert: true, style: 'position:absolute;inset-inline:0;inset-block-start:0;visibility:hidden;contain:layout' }
      return untrack(() => props.tag) === 'ol' ? <li {...attrs}>{body}</li> : <div {...attrs}>{body}</div>
    }}</For>
    : null)
  return (
    <div
      ref={(n: any) => (el = n)}
      class={props.class}
      data-scope={props.scope ?? (props.part ? undefined : 'virtual')}
      data-part={props.part}
      data-variable={props.scope || props.part ? undefined : ''}
      role={inner ? undefined : props.role ?? 'list'}
      aria-label={inner ? undefined : props.label}
      aria-live={props.role === 'log' ? 'off' : undefined}
      aria-busy={!inner && props.busy ? 'true' : undefined}
      tabindex={untrack(() => props.roving) ? undefined : 0}
      style={props.height ? `block-size:${props.height}` : undefined}
      onKeyDown={onKeyDown}
    >
      {untrack(() => props.tag) === 'ol'
        ? <ol {...listAttrs()}>{rowsOut()}{probed()}</ol>
        : <div {...listAttrs()}>{rowsOut()}{probed()}</div>}
    </div>
  )
}
