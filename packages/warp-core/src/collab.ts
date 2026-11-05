// The warp-core half of the collab pack (07 §5, §6; 06 §10): pure logic and actions, no framework. Nothing here knows a
// transport: peers, ops and cursors arrive as plain data, so `query.live`, `channel` or a plain signal all fit.
import { reducedMotion } from './motion'

// ---- peers ------------------------------------------------------------------------------------------------------

import { peerColor, type Peer } from './collab-peer'
import { formTag } from './collab-form'
export { peerColor, type Peer } from './collab-peer'

/** The first word of a name. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0]!

/** "Ana", "Ana and Kofi", "Ana, Kofi and Mei". */
export function joinNames(names: readonly string[]) {
  if (names.length < 2) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** The line under the log: at most two names, then a count. Empty when nobody is typing. */
export function typingLine(names: readonly string[]) {
  if (!names.length) return ''
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${joinNames(names)} are typing…`
  return `${names.length} people are typing…`
}

/** What changed between two peer lists, summarised (07 §6.3): "Ana and Kofi joined", "Mei left". */
export function presenceDelta(before: readonly Peer[], after: readonly Peer[]) {
  const had = new Set(before.map((p) => p.id)),
    has = new Set(after.map((p) => p.id))
  const joined = after.filter((p) => !had.has(p.id)).map((p) => firstName(p.name))
  const left = before.filter((p) => !has.has(p.id)).map((p) => firstName(p.name))
  return [
    ...(joined.length ? [`${joinNames(joined)} joined`] : []),
    ...(left.length ? [`${joinNames(left)} left`] : []),
  ].join('. ')
}

/** Collect calls and hand them over together after `ms` of quiet (07 §0: bursts collapse into one sentence). */
export function burst<T>(flush: (items: T[]) => void, ms = 1000) {
  let items: T[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    push(item: T) {
      items.push(item)
      clearTimeout(timer)
      timer = setTimeout(() => {
        const all = items
        items = []
        flush(all)
      }, ms)
    },
    cancel: () => {
      clearTimeout(timer)
      items = []
    },
  }
}

/** Ids not seen before, marked once: a refetch never re-animates a row, and the first list never animates (07 §0). */
export function arrivalTracker() {
  const seen = new Set<string>()
  let fresh: string[] = []
  let first = true
  return (ids: readonly string[]) => {
    for (const id of ids) {
      if (!first && !seen.has(id)) fresh = [...fresh, id]
      seen.add(id)
    }
    first = false
    return fresh
  }
}

// ---- chat -------------------------------------------------------------------------------------------------------

export {
  GROUP_MS,
  QUOTE_MAX,
  STICK_PX,
  threadRows,
  excerpt,
  quoteText,
  textParts,
  mentionQuery,
  insertMention,
  reactionName,
  messageLog,
} from './collab-message'
export type {
  Delivery,
  MessageQuote,
  MessageReaction,
  MessageAttachment,
  ChatMessage,
  ThreadRow,
  TextPart,
  MessageLogOptions,
} from './collab-message'

// ---- cursors, follow, auto-track --------------------------------------------------------------------------------

/** Where a peer's pointer is on the shared page. */
export interface PeerCursor {
  /** The `data-anchor` value it is anchored to. */
  anchor: string
  /** Position inside the anchor's box, 0–1, so it lines up across viewport sizes. */
  x: number
  y: number
}
/** A peer, with their cursor when it's known. */
export type CursorPeer = Peer & { cursor?: PeerCursor | null }

const ARROW = 'M1 1l5.5 13 2-5.5L14 6.5z'
const CHEVRON = { top: 'M3 11l5-6 5 6z', bottom: 'M3 5l5 6 5-6z' }

/** Where a cursor sits in the layer: `over` is -1 or 1 when its anchor is off the layer's top or bottom edge. */
export function cursorPoint(
  anchor: { left: number; top: number; width: number; height: number },
  base: { left: number; top: number; height: number },
  c: Pick<PeerCursor, 'x' | 'y'>,
) {
  const x = anchor.left - base.left + anchor.width * c.x
  const y = anchor.top - base.top + anchor.height * c.y
  return { x, y, over: y < 0 ? -1 : y > base.height ? 1 : 0 }
}

/** Options for live cursors: who's here, the element they're relative to, and how long until one goes idle. */
export interface CursorsOptions {
  peers: readonly CursorPeer[]
  anchor?: string | undefined
  idle?: number
}

/**
 * PageCursorsLayer (07 §6.1): each `[data-peer]` cursor follows its anchor by custom property, glides by CSS, fades
 * (data-idle) after `idle` ms without a move. An anchor off the layer pins an edge chevron in the peer's colour.
 */
export function cursorsLayer(layer: HTMLElement, opts: CursorsOptions) {
  let o = opts
  const win = layer.ownerDocument.defaultView!
  const scope = layer.parentElement ?? layer
  const moved = new Map<string, { key: string; at: number }>()
  const place = () => {
    const base = layer.getBoundingClientRect()
    const anchors = [...scope.querySelectorAll<HTMLElement>(o.anchor ?? '[data-anchor]')]
    for (const el of layer.querySelectorAll<HTMLElement>('[data-scope="cursor"]')) {
      const c = o.peers.find((p) => p.id === el.dataset.peer)?.cursor
      const to = c && anchors.find((a) => a.dataset.anchor === c.anchor)
      el.hidden = !to
      if (!to || !c) continue
      const p = cursorPoint(to.getBoundingClientRect(), base, c)
      el.style.setProperty('--_x', `${Math.round(p.x)}px`)
      el.style.setProperty(
        '--_y',
        `${Math.round(p.over ? (p.over < 0 ? 0 : base.height - 16) : p.y)}px`,
      )
      el.querySelector('path')?.setAttribute(
        'd',
        p.over ? CHEVRON[p.over < 0 ? 'top' : 'bottom'] : ARROW,
      )
    }
  }
  const fade = () => {
    const now = performance.now()
    for (const p of o.peers) {
      if (!p.cursor) continue
      const key = `${p.cursor.anchor}:${p.cursor.x}:${p.cursor.y}`
      const was = moved.get(p.id)
      if (was?.key !== key) moved.set(p.id, { key, at: now })
    }
    for (const el of layer.querySelectorAll<HTMLElement>('[data-scope="cursor"]')) {
      const m = moved.get(el.dataset.peer!)
      el.toggleAttribute('data-idle', !!m && now - m.at >= (o.idle ?? 5000))
    }
  }
  const tick = () => {
    fade()
    place()
  }
  const timer = setInterval(fade, 1000)
  win.addEventListener('scroll', place, { capture: true, passive: true })
  win.addEventListener('resize', place)
  tick()
  return {
    update(next: CursorsOptions) {
      o = next
      queueMicrotask(tick)
    },
    destroy() {
      clearInterval(timer)
      win.removeEventListener('scroll', place, { capture: true })
      win.removeEventListener('resize', place)
    },
  }
}

const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '])

/** Call `fn` on a scroll the user made (wheel, touch, keys): a program's scroll never counts. Returns a remover. */
export function userScroll(el: HTMLElement, fn: () => void) {
  const key = (e: KeyboardEvent) => {
    if (SCROLL_KEYS.has(e.key)) fn()
  }
  el.addEventListener('wheel', fn, { passive: true })
  el.addEventListener('touchmove', fn, { passive: true })
  el.addEventListener('keydown', key)
  return () => {
    el.removeEventListener('wheel', fn)
    el.removeEventListener('touchmove', fn)
    el.removeEventListener('keydown', key)
  }
}

const glide = (el: HTMLElement, top: number) =>
  el.scrollTo?.({ top, behavior: reducedMotion(el) ? 'auto' : 'smooth' })

/** Options for following a peer's viewport. */
export interface FollowOptions {
  on: boolean
  /** The followed viewport's top, 0–1 of the document. */ top?: number | undefined
  onStop(): void
}

/** Following (07 §6.1): the element rides the peer's viewport; any scroll of the user's, or Esc, stops it. */
export function followViewport(el: HTMLElement, opts: FollowOptions) {
  let o = opts
  const doc = el.ownerDocument
  const stop = () => {
    if (o.on) o.onStop()
  }
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !e.defaultPrevented) stop()
  }
  const ride = () => {
    if (o.on && o.top !== undefined) glide(el, o.top * el.scrollHeight)
  }
  const off = userScroll(el, stop)
  doc.addEventListener('keydown', onEsc)
  ride()
  return {
    update(next: FollowOptions) {
      o = next
      ride()
    },
    destroy() {
      off()
      doc.removeEventListener('keydown', onEsc)
    },
  }
}

/** Options for tracking a presenter through the sections of a page. */
export interface AutoTrackOptions {
  following: boolean
  /** The `data-section` the presenter is in. */ section?: string | undefined
  onPause(): void
}

/** MultiplayerAutoTrack (07 §6.4): scroll to the presenter's section; a manual scroll pauses it and never fights. */
export function autoTrack(region: HTMLElement, opts: AutoTrackOptions) {
  let o = opts
  const go = () => {
    if (!o.following || !o.section) return
    const sec = [...region.querySelectorAll<HTMLElement>('[data-section]')].find(
      (s) => s.dataset.section === o.section,
    )
    if (sec) glide(region, sec.offsetTop - region.offsetTop - 4)
  }
  const off = userScroll(region, () => {
    if (o.following) o.onPause()
  })
  go()
  return {
    update(next: AutoTrackOptions) {
      o = next
      go()
    },
    destroy: off,
  }
}

// ---- kanban -----------------------------------------------------------------------------------------------------

export { findCard, moveCard, stepCard, moveLine, kanban } from './collab-board'
export type { BoardCard, BoardColumn, BoardSpot, KanbanOptions } from './collab-board'

// ---- synced form, data integrity --------------------------------------------------------------------------------

/** A field change sent to the others editing a form. */
export interface FormOp {
  seq: number
  name: string
  value: string | boolean
  peer: Peer
}
/** Options for a form several people edit at once. */
export interface SyncedFormOptions {
  /** Remote edits, oldest first. Each `seq` applies once; an older one is dropped. */
  ops: readonly FormOp[]
  onSend?: ((name: string, value: string | boolean) => void) | undefined
  /** How long the ring and tag show. */
  hold?: number
}

const REMOTE_MS = 1400

/**
 * All-inputs sync (07 §6.4): every named control in the form is shared state. A remote edit rings the field in the
 * peer's colour and tags it for 1.4 s; a field with focus is never overwritten, the edit queues until blur. Text and
 * choices both send on `input` only.
 */
export function syncedForm(form: HTMLFormElement, opts: SyncedFormOptions) {
  let o = opts
  let last = 0
  const doc = form.ownerDocument
  const pending = new Map<string, FormOp>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const control = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null
  const { rootOf, tagOf } = formTag(form, doc)
  const apply = (op: FormOp) => {
    const el = control(op.name)
    if (!el) return
    const tag = tagOf(op, el)
    if (doc.activeElement === el) {
      pending.set(op.name, op)
      tag.textContent = `${op.peer.name} changed this · applies when you leave the field`
      return
    }
    if (el.type === 'checkbox') el.checked = !!op.value
    else el.value = String(op.value)
    el.closest('[data-part="control"]')?.toggleAttribute('data-filled', true)
    const root = rootOf(el)
    tag.textContent = `${op.peer.name} edited`
    root.dataset.presenceColor = String(peerColor(op.peer))
    root.toggleAttribute('data-remote', true)
    clearTimeout(timers.get(op.name))
    timers.set(
      op.name,
      setTimeout(() => {
        tag.hidden = true
        root.removeAttribute('data-remote')
      }, o.hold ?? REMOTE_MS),
    )
  }
  const take = () => {
    for (const op of o.ops) {
      if (op.seq <= last) continue
      last = op.seq
      apply(op)
    }
  }
  const onInput = (e: Event) => {
    const el = e.target as HTMLInputElement
    if (el.name) o.onSend?.(el.name, el.type === 'checkbox' ? el.checked : el.value)
  }
  const onLeave = (e: FocusEvent) => {
    const name = (e.target as HTMLInputElement).name
    const op = name ? pending.get(name) : undefined
    if (!op) return
    pending.delete(name)
    // focusout fires before activeElement moves
    queueMicrotask(() => apply(op))
  }
  form.addEventListener('input', onInput)
  form.addEventListener('focusout', onLeave)
  take()
  return {
    update(next: SyncedFormOptions) {
      o = next
      take()
    },
    destroy() {
      for (const t of timers.values()) clearTimeout(t)
      form.removeEventListener('input', onInput)
      form.removeEventListener('focusout', onLeave)
    },
  }
}

export { p95, integrityCounter } from './collab-integrity'
export type { IntegrityStats } from './collab-integrity'
