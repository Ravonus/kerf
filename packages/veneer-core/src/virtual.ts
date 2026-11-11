import { virtualGeometry } from './virtual-geometry'
import { virtualRange } from './virtual-range'
import { virtualRekey } from './virtual-rekey'
import { virtualObservers } from './virtual-observers'
import { virtualApi } from './virtual-api'
import { createVirtualState } from './virtual-state'
import type { Sizes } from './virtual-sizes'
export { Sizes } from './virtual-sizes'

// Virtualisation (06 §9, research 11 §2.2): the one window every long collection sits on. `Sizes` is the height index,
// `virtualizer` the scroller's behaviour; neither knows what a row is, so a chat, a board column and a data grid share
// them. Rows sit at a known offset, so what's above the viewport can change without the viewport moving: a size change
// above the anchor row moves `scrollTop` by the same amount, before paint.

/** What identifies a row. */
export type VirtualKey = string | number
/** Where a row lands when scrolled to. */
export type VirtualAlign = 'start' | 'center' | 'end'

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
  gap?: number | undefined
  /** Pixels rendered past each edge of the viewport. Default: one viewport, at least 200. */
  overscan?: number | undefined
  /** `'x'` virtualises columns. Default `'y'`. */
  axis?: 'x' | 'y'
  /** A sticky header inside the spacer, before the first row: rows sit below it and it isn't viewport. */
  head?: number
  /** The sizes are the truth and the virtualizer writes them to each row, so rows aren't watched. */
  sized?: boolean
  /** Keep the end in view while the user is within this many pixels of it (a chat log). */
  stick?: number | undefined
  /** Start at the end, not the start. */
  from?: 'start' | 'end' | undefined
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

/** Keeps only the rows near the viewport in the DOM, measuring them as they arrive. */
export function virtualizer(el: HTMLElement, initial: VirtualOptions): Virtualizer {
  const v = createVirtualState(el, initial)

  const g = virtualGeometry(v)
  const r = virtualRange(v, g)
  const { watched, measure, box } = virtualObservers(v, g, r, () => api)
  const api = virtualApi(v, g, r, watched, box)

  v.el.style.overflowAnchor = 'none' // the browser's anchoring can't see absolutely positioned rows, and we do it here
  measure()
  virtualRekey(v, g, r, v.o.keys)
  if (v.o.from === 'end') r.end()
  r.range()
  v.el.addEventListener('scroll', r.onScroll, { passive: true })
  box?.observe(v.el)
  box?.observe(v.o.spacer)
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
