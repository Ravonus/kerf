// Virtualisation (06 §9, research 11 §2.2): the one window every long collection sits on. `Sizes` is the height index,
// `virtualizer` the scroller's behaviour; neither knows what a row is, so a chat, a board column and a data grid share
// them. Rows sit at a known offset, so what's above the viewport can change without the viewport moving: a size change
// above the anchor row moves `scrollTop` by the same amount, before paint.

/** What identifies a row. */
export type VirtualKey = string | number
/** Where a row lands when scrolled to. */
export type VirtualAlign = 'start' | 'center' | 'end'

/** Sizes with O(log n) offsets (a Fenwick tree): set one, read the offset of any index, find the index at an offset. */
export class Sizes {
  private all: number[] = []
  private tree = new Float64Array(1)
  private sum = 0

  constructor(sizes: readonly number[] = []) {
    this.fill(sizes)
  }

  get length() { return this.all.length }
  get total() { return this.sum }
  get(i: number) { return this.all[i] }

  /** Replace everything, in O(n). */
  fill(sizes: readonly number[]) {
    this.all = sizes.slice()
    this.grow(this.all.length)
  }

  private grow(capacity: number) {
    const tree = new Float64Array(Math.max(capacity, 16) * 2 + 1)
    this.sum = 0
    for (let i = 1; i < tree.length; i++) {
      const size = this.all[i - 1] ?? 0
      this.sum += size
      tree[i]! += size
      const up = i + (i & -i)
      if (up < tree.length) tree[up]! += tree[i]!
    }
    this.tree = tree
  }

  set(i: number, size: number) {
    const delta = size - this.all[i]!
    if (!delta) return 0
    this.all[i] = size
    this.sum += delta
    for (let at = i + 1; at < this.tree.length; at += at & -at) this.tree[at]! += delta
    return delta
  }

  push(size: number) {
    if (this.all.length + 1 >= this.tree.length) this.grow((this.all.length + 1) * 2)
    this.all.push(0)
    this.set(this.all.length - 1, size)
  }

  /** The sum of the sizes before `i`. */
  offset(i: number) {
    let sum = 0
    for (let at = Math.min(i, this.all.length); at > 0; at -= at & -at) sum += this.tree[at]!
    return sum
  }

  /** The index whose box holds `y`, clamped to the list. */
  at(y: number) {
    const n = this.all.length
    if (!n || y <= 0) return 0
    let at = 0, left = y
    for (let step = 1 << (31 - Math.clz32(this.tree.length - 1)); step; step >>= 1) {
      const next = at + step
      if (next < this.tree.length && next <= n && this.tree[next]! <= left) { at = next; left -= this.tree[next]! }
    }
    return Math.min(at, n - 1)
  }
}

/** Options for the virtualizer. */
export interface VirtualOptions {
  /** Each item's identity, in order: sizes and the anchor follow a key through inserts, prepends and removals. */
  keys: readonly VirtualKey[]
  /** The box the rows sit in: its size is the total. Rows are positioned inside it. */
  spacer: HTMLElement
  /** A row's size before it's known. */
  estimate: number | ((index: number) => number)
  /** The size known before render, for the current cross-axis size: exact text heights. `undefined` = not known yet. */
  size?: (index: number, width: number) => number | undefined
  /** Added to every size, between rows. */
  gap?: number
  /** Pixels rendered past each edge of the viewport. Default: one viewport, at least 200. */
  overscan?: number
  /** `'x'` virtualises columns. Default `'y'`. */
  axis?: 'x' | 'y'
  /** A sticky header inside the spacer, before the first row: rows sit below it and it isn't viewport. */
  head?: number
  /** The sizes are the truth and the virtualizer writes them to each row, so rows aren't watched. */
  sized?: boolean
  /** Keep the end in view while the user is within this many pixels of it (a chat log). */
  stick?: number
  /** Start at the end, not the start. */
  from?: 'start' | 'end'
  /** Also render these, wherever they are: the focused row, so focus and `aria-activedescendant` have a node. */
  pinned?: () => readonly VirtualKey[]
  /** The rows to render changed: ascending indices. */
  onRange: (indices: number[]) => void
  /** The user moved away from the end, or came back to it. */
  onStick?: (stuck: boolean) => void
  /** A rendered row isn't the size `size` said: dev reporting (X001). */
  onDrift?: (index: number, predicted: number, actual: number) => void
  /** The scroller moved. */
  onScroll?: (position: number) => void
}

/** What a virtualized list can do. */
export interface Virtualizer {
  /** New keys or options. Row sizes stay with their keys; the anchor row stays where it is on screen. */
  update(options: Partial<VirtualOptions>): void
  /** Ask `size` again for `[from, to)`: more text has been prepared. Default everything. */
  refresh(from?: number, to?: number): void
  /** Take this element as `key`'s row: it's positioned and watched. Returns the release. */
  attach(el: HTMLElement, key: VirtualKey): () => void
  scrollTo(index: number, align?: VirtualAlign): void
  scrollToEnd(): void
  /** The row at the top of the viewport, and the pixels of it above the edge. */
  anchor(): { index: number; within: number }
  readonly sizes: Sizes
  readonly stuck: boolean
  destroy(): void
}

const FALLBACK_VIEWPORT = 600 // nothing's laid out yet (SSR, a hidden parent): render about a screen

/** Keeps only the rows near the viewport in the DOM, measuring them as they arrive. */
export function virtualizer(el: HTMLElement, initial: VirtualOptions): Virtualizer {
  const o = { ...initial }
  const horizontal = o.axis === 'x'
  const sizes = new Sizes()
  const known = new Map<VirtualKey, { size: number; cross: number }>() // what rendered rows actually measured
  const rows = new Map<VirtualKey, { el: HTMLElement; at: number; size: number }>()
  const keyOf = new WeakMap<Element, VirtualKey>()
  let keys: readonly VirtualKey[] = []
  let index = new Map<VirtualKey, number>()
  let viewport = 0, cross = 0, lead = 0, trail = 0
  let last: number[] = []
  let stuck = o.from === 'end'

  const gap = () => o.gap ?? 0
  const estimate = (i: number) => (typeof o.estimate === 'function' ? o.estimate(i) : o.estimate)
  // The browser rounds scrollTop, so a run of small corrections read from it would drift by the rounding of each.
  let exact = 0
  const position = () => {
    const real = (horizontal ? Math.abs(el.scrollLeft) : el.scrollTop) - lead
    return Math.abs(real - exact) < 1 ? exact : real
  }
  const move = (to: number) => {
    const next = Math.max(0, to + lead)
    exact = next - lead
    if (horizontal) el.scrollLeft = next
    else el.scrollTop = next
  }
  const head = () => o.head ?? 0
  const room = () => (viewport || FALLBACK_VIEWPORT) - head()
  const sizeFor = (i: number) => {
    const seen = known.get(keys[i]!)
    if (seen && seen.cross === cross) return seen.size + gap()
    return (o.size?.(i, cross) ?? seen?.size ?? estimate(i)) + gap()
  }

  function bounds() {
    if (horizontal) o.spacer.style.inlineSize = `${sizes.total + head()}px`
    else o.spacer.style.blockSize = `${Math.max(0, sizes.total - gap()) + head()}px`
  }

  function place(key: VirtualKey) {
    const row = rows.get(key), i = index.get(key)
    if (!row || i === undefined) return
    const at = sizes.offset(i) + head()
    if (at !== row.at) {
      row.at = at
      row.el.style.transform = horizontal ? `translateX(${at}px)` : `translateY(${at}px)`
    }
    if (!o.sized) return
    const size = sizes.get(i)! - gap()
    if (size === row.size) return
    row.size = size
    if (horizontal) row.el.style.inlineSize = `${size}px`
    else row.el.style.blockSize = `${size}px`
  }

  function range() {
    const n = keys.length
    if (!n) return emit([])
    const over = o.overscan ?? Math.max(room(), 200), top = position()
    const start = sizes.at(top - over), end = Math.min(n - 1, sizes.at(top + room() + over))
    const out: number[] = []
    for (let i = start; i <= end; i++) out.push(i)
    for (const key of o.pinned?.() ?? []) {
      const i = index.get(key)
      if (i !== undefined && (i < start || i > end)) out.push(i)
    }
    emit(out.sort((a, b) => a - b))
  }

  function emit(next: number[]) {
    if (next.length === last.length && next.every((n, i) => n === last[i])) return
    last = next
    o.onRange(next)
  }

  function setStuck(next: boolean) {
    if (next === stuck) return
    stuck = next
    o.onStick?.(next)
  }

  const end = () => move(sizes.total - gap() - room() + trail)

  /** Run a change to the sizes; the row at the top of the viewport doesn't move on screen. */
  function anchored(change: () => void) {
    const before = position(), at = sizes.at(before), from = sizes.offset(at)
    change()
    bounds()
    for (const key of rows.keys()) place(key)
    if (o.stick != null && stuck) end()
    else {
      const moved = sizes.offset(at) - from
      if (moved) move(before + moved)
    }
    range()
  }

  function onScroll() {
    if (o.stick != null) setStuck(sizes.total - gap() - room() - position() <= o.stick)
    range()
    o.onScroll?.(position())
  }

  function rekey(next: readonly VirtualKey[]) {
    const old = keys
    if (next === old) return
    const shared = Math.min(old.length, next.length)
    let same = 0
    while (same < shared && old[same] === next[same]) same++
    keys = next
    if (same === old.length) { // the common case, a growing list: nothing above moves
      for (let i = same; i < next.length; i++) { index.set(next[i]!, i); sizes.push(sizeFor(i)) }
      bounds()
      if (o.stick != null && stuck) end()
      range()
      return
    }
    const at = position(), held = sizes.at(at), key = old[held]!, within = at - sizes.offset(held)
    index = new Map(next.map((k, i) => [k, i]))
    sizes.fill(next.map((_, i) => sizeFor(i)))
    for (const k of known.keys()) if (!index.has(k)) known.delete(k)
    bounds()
    for (const k of rows.keys()) place(k)
    const found = index.get(key)
    if (o.stick != null && stuck) end()
    else if (found !== undefined) move(sizes.offset(found) + within)
    range()
  }

  const rowBox = (e: ResizeObserverEntry) => {
    const box = e.borderBoxSize?.[0]
    return box ? (horizontal ? box.inlineSize : box.blockSize) : (horizontal ? (e.target as HTMLElement).offsetWidth : (e.target as HTMLElement).offsetHeight)
  }

  const watched = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    if (measure()) api.refresh() // rows report a new width before the box does: these sizes belong to it
    const changed: [number, VirtualKey, number][] = []
    for (const e of entries) {
      const key = keyOf.get(e.target), i = key === undefined ? undefined : index.get(key)
      if (key === undefined || i === undefined) continue
      const size = rowBox(e)
      if (!size) continue // display: none, or a detached row
      known.set(key, { size, cross })
      if (Math.abs(size + gap() - sizes.get(i)!) > 0.01) changed.push([i, key, size])
    }
    if (!changed.length) return
    anchored(() => { for (const [i, , size] of changed) { o.onDrift?.(i, sizes.get(i)! - gap(), size); sizes.set(i, size + gap()) } })
  }) : null

  const measure = () => {
    const c = getComputedStyle(el)
    const pad = parseFloat(horizontal ? c.paddingInlineStart : c.paddingBlockStart) || 0
    trail = parseFloat(horizontal ? c.paddingInlineEnd : c.paddingBlockEnd) || 0
    lead = o.spacer.offsetParent === el ? (horizontal ? o.spacer.offsetLeft : o.spacer.offsetTop) : pad
    const box = el.getBoundingClientRect()
    const next = { viewport: horizontal ? el.clientWidth : el.clientHeight, cross: o.spacer.getBoundingClientRect()[horizontal ? 'height' : 'width'] || (horizontal ? box.height : box.width) }
    const moved = next.cross !== cross
    viewport = next.viewport
    cross = next.cross
    return moved
  }

  const box = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (measure()) api.refresh()
    else { if (o.stick != null && stuck) end(); range() }
  }) : null

  const api: Virtualizer = {
    sizes,
    get stuck() { return stuck },
    update(next) {
      const before = o.keys
      Object.assign(o, next)
      if (next.keys && next.keys !== before) rekey(next.keys)
      else range()
    },
    refresh(from = 0, to = keys.length) {
      anchored(() => { for (let i = from; i < Math.min(to, keys.length); i++) sizes.set(i, sizeFor(i)) })
    },
    attach(row, key) {
      keyOf.set(row, key)
      rows.set(key, { el: row, at: -1, size: -1 })
      place(key)
      if (!o.sized) watched?.observe(row)
      return () => {
        watched?.unobserve(row)
        if (rows.get(key)?.el === row) rows.delete(key)
      }
    },
    scrollTo(i, align = 'start') {
      const at = sizes.offset(i), size = sizes.get(i) ?? 0
      move(align === 'start' ? at : align === 'center' ? at - (room() - size) / 2 : at + size - gap() - room())
      onScroll()
    },
    scrollToEnd() {
      end()
      onScroll()
    },
    anchor() {
      const top = position(), at = sizes.at(top)
      return { index: at, within: top - sizes.offset(at) }
    },
    destroy() {
      el.removeEventListener('scroll', onScroll)
      watched?.disconnect()
      box?.disconnect()
    },
  }

  el.style.overflowAnchor = 'none' // the browser's anchoring can't see absolutely positioned rows, and we do it here
  measure()
  rekey(o.keys)
  if (o.from === 'end') end()
  range()
  el.addEventListener('scroll', onScroll, { passive: true })
  box?.observe(el)
  box?.observe(o.spacer)
  return api
}

/** Run `step` until it returns false, a few ms per slice, between frames (research 11 §2.1). */
export function slices(step: () => boolean, budget = 4) {
  const channel = typeof MessageChannel === 'function' ? new MessageChannel() : null
  let stopped = false
  const run = () => {
    if (stopped) return
    const until = performance.now() + budget
    while (performance.now() < until) if (!step()) return stop()
    if (channel) channel.port2.postMessage(0)
    else setTimeout(run)
  }
  const stop = () => {
    stopped = true
    channel?.port1.close()
    channel?.port2.close()
  }
  if (channel) channel.port1.onmessage = run
  run()
  return stop
}
