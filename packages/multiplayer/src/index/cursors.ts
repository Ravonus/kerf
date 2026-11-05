import {
  derived,
  onCleanup,
  onMount,
  state,
  untrack,
  type Derived,
  type State,
} from '@weft-js/core'
import type { CursorAt, Peer, Presence } from '../index'
import { isServer, silent } from './shared'

// ---- cursors --------------------------------------------------------------------------------------------------------

/** Options of `cursors()`. */
export interface CursorOptions {
  /** What a position is measured from. An element's id, in this attribute, on both sides. Default `data-anchor`. */
  anchor?: string
  /** Sends a second. Default 12, which keeps a socket under its default 20 a second with room for everything else. */
  rate?: number
  /** Ms before a still cursor fades. Default 5000. */
  idle?: number
  /** Where the pointer is followed. Default the document. */
  root?: () => HTMLElement | Document
  style?: string
}

/** One other cursor, placed on this screen. `peer` is missing until their presence arrives. */
export interface LiveCursor<S = unknown> {
  id: string
  peer?: Peer<S> | undefined
  at: CursorAt
  left: number
  top: number
  moved: number
  idle: boolean
}
/** What `cursors()` returns, for `<Cursors of={…} />`. */
export interface Cursors<S = unknown> {
  readonly list: Derived<LiveCursor<S>[]>
  readonly anchor: string
}

/** Where a local pointer is, relative to the nearest anchor, or the viewport without one. Pure but for reading layout. */
export function locate(
  target: Element | null,
  x: number,
  y: number,
  attr = 'data-anchor',
  view = { width: innerWidth, height: innerHeight },
): CursorAt {
  const el = target?.closest?.(`[${attr}]`) as HTMLElement | null | undefined
  if (el) {
    const r = el.getBoundingClientRect()
    const w = Math.max(el.scrollWidth, r.width) || 1,
      h = Math.max(el.scrollHeight, r.height) || 1
    return {
      a: el.getAttribute(attr)!,
      x: (x - r.left + el.scrollLeft) / w,
      y: (y - r.top + el.scrollTop) / h,
    }
  }
  return { x: x / view.width, y: y / view.height }
}

/** The same spot on this screen. Null when the anchor isn't here: a cursor at (0,0) would be a lie. */
export function resolve(
  at: CursorAt,
  attr = 'data-anchor',
  view = { width: innerWidth, height: innerHeight },
): { left: number; top: number } | null {
  if (!at.a) return { left: at.x * view.width, top: at.y * view.height }
  const el = document.querySelector<HTMLElement>(`[${attr}="${CSS.escape(at.a)}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    left: r.left + at.x * Math.max(el.scrollWidth, r.width) - el.scrollLeft,
    top: r.top + at.y * Math.max(el.scrollHeight, r.height) - el.scrollTop,
  }
}

/** Sends this pointer, latest wins, and tracks everyone else's. Sending and the page's own events stop with the owner. */
export function cursors<S>(room: Presence<S>, options: CursorOptions = {}): Cursors<S> {
  const { anchor = 'data-anchor', rate = 12, idle = 5000, root, style } = options
  const gap = 1000 / rate
  const raw = state<Record<string, { at: CursorAt; moved: number }>>({})
  const layout = state(0)
  const clock = state(0)
  const send = (at: CursorAt | null) => {
    const link = room.link()
    if (link) link.send(JSON.stringify(at))
    else silent(room.connection.send('mp.cursor', at))
  }
  room.seen((id, at) => {
    const { [id]: _, ...rest } = untrack(() => raw.value)
    raw.value = at ? { ...rest, [id]: { at, moved: Date.now() } } : rest
  })

  onMount(() => mountCursor(root, gap, anchor, style, send, layout, clock))

  const list = derived(() => {
    void layout.value
    const now = clock.value || Date.now()
    const peers = room.peers.value
    const out: LiveCursor<S>[] = []
    for (const [id, { at, moved }] of Object.entries(raw.value)) {
      const spot = resolve(at, anchor)
      if (spot)
        out.push({
          id,
          peer: peers.find((p) => p.id === id),
          at,
          ...spot,
          moved,
          idle: now - moved > idle,
        })
    }
    return out
  })
  return { list, anchor }
}

function mountCursor(
  root: (() => HTMLElement | Document) | undefined,
  gap: number,
  anchor: string,
  style: string | undefined,
  send: (at: CursorAt | null) => void,
  layout: State<number>,
  clock: State<number>,
) {
  if (isServer()) return
  const host = root?.() ?? document
  let last = 0,
    waiting: ReturnType<typeof setTimeout> | undefined,
    next: CursorAt | null | undefined
  const flush = () => {
    waiting = undefined
    if (next === undefined) return
    last = performance.now()
    send(next)
    next = undefined
  }
  const put = (at: CursorAt | null) => {
    next = at
    const wait = gap - (performance.now() - last)
    if (wait <= 0) flush()
    else waiting ??= setTimeout(flush, wait)
  }
  const move = (e: Event) => {
    const p = e as PointerEvent
    put({
      ...locate(p.target as Element, p.clientX, p.clientY, anchor),
      ...(style ? { style } : {}),
    })
  }
  const out = () => put(null)
  let frame = 0
  const moved = () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0
      layout.value++
    })
  }
  host.addEventListener('pointermove', move, { passive: true })
  document.documentElement.addEventListener('pointerleave', out)
  addEventListener('scroll', moved, { passive: true, capture: true })
  addEventListener('resize', moved)
  const tick = setInterval(() => {
    clock.value = Date.now()
  }, 1000)
  onCleanup(() => {
    host.removeEventListener('pointermove', move)
    document.documentElement.removeEventListener('pointerleave', out)
    removeEventListener('scroll', moved, { capture: true })
    removeEventListener('resize', moved)
    clearInterval(tick)
    clearTimeout(waiting)
    cancelAnimationFrame(frame)
  })
}

/** A peer's colour, the same for them everywhere. */
export function hue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}
