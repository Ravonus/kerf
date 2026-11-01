// The ui-core half of the collab pack (07 §5, §6; 06 §10): pure logic and actions, no framework. Nothing here knows a
// transport: peers, ops and cursors arrive as plain data, so `query.live`, `channel` or a plain signal all fit.
import { reducedMotion } from './motion'
import { installSweep } from './sweep'
import { announce } from './toast'

// ---- peers ------------------------------------------------------------------------------------------------------

export interface Peer { id: string; name: string; /** Presence colour, data palette 1–8; stable per peer when left out. */ color?: number }

/** A stable slot in the data palette (1–8) for a peer id. */
export function peerColor(p: { id: string; color?: number }) {
  if (p.color) return p.color
  let h = 0
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0
  return (h % 8) + 1
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0]

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
  const had = new Set(before.map(p => p.id)), has = new Set(after.map(p => p.id))
  const joined = after.filter(p => !had.has(p.id)).map(p => firstName(p.name))
  const left = before.filter(p => !has.has(p.id)).map(p => firstName(p.name))
  return [...(joined.length ? [`${joinNames(joined)} joined`] : []), ...(left.length ? [`${joinNames(left)} left`] : [])].join('. ')
}

/** Collect calls and hand them over together after `ms` of quiet (07 §0: bursts collapse into one sentence). */
export function burst<T>(flush: (items: T[]) => void, ms = 1000) {
  let items: T[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    push(item: T) {
      items.push(item)
      clearTimeout(timer)
      timer = setTimeout(() => { const all = items; items = []; flush(all) }, ms)
    },
    cancel() { clearTimeout(timer); items = [] },
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

export type Delivery = 'sending' | 'sent' | 'read' | 'failed'
export interface MessageQuote { ref?: string; text: string; /** Kept for a source that isn't loaded. */ author?: string; time?: string; /** The source lives in another channel. */ channel?: string; deleted?: boolean }
export interface MessageReaction { emoji: string; /** Spoken name: "Thumbs up". */ label?: string; count: number; mine?: boolean; names?: string[] }
export interface MessageAttachment { kind: string; name: string; meta?: string }
export interface ChatMessage {
  id: string
  author: Peer
  mine?: boolean
  text: string
  /** Display time, formatted by the app ("09:48"). */
  time: string
  /** Epoch ms, for grouping. */
  at?: number
  /** Day label, formatted by the app ("Today"): a new label draws a divider. */
  day?: string
  state?: Delivery
  readAt?: string
  quote?: MessageQuote
  attachment?: MessageAttachment
  reactions?: MessageReaction[]
  replies?: { count: number; last?: string; people?: Peer[] }
  /** Names mentioned in `text`, without the @. "you" marks the whole message. */
  mentions?: string[]
  /** The text is still arriving: rendered with `<Text stream>`. */
  streaming?: boolean
}

export const GROUP_MS = 5 * 60 * 1000
export const QUOTE_MAX = 280
export const STICK_PX = 48

export type ThreadRow =
  | { kind: 'day'; id: string; label: string; unread: boolean }
  | { kind: 'unread'; id: string; label: string; unread: true }
  | { kind: 'message'; id: string; message: ChatMessage; continued: boolean; last: boolean }

/**
 * The log's rows from its messages: a divider per day, the unread divider before `unreadFrom` ("New · Today" when it
 * lands on a day boundary, so the two never stack), and `continued` for one author within 5 minutes.
 */
export function threadRows(messages: readonly ChatMessage[], unreadFrom?: string | null): ThreadRow[] {
  const rows: ThreadRow[] = []
  const lastMine = messages.findLast(m => m.mine)?.id
  let prev: ChatMessage | undefined
  let day: string | undefined
  for (const m of messages) {
    const newDay = m.day !== undefined && m.day !== day
    const unread = m.id === unreadFrom
    if (newDay) rows.push({ kind: 'day', id: `day:${m.day}`, label: `${unread ? 'New · ' : ''}${m.day}`, unread })
    else if (unread) rows.push({ kind: 'unread', id: `unread:${m.id}`, label: 'New', unread: true })
    if (m.day !== undefined) day = m.day
    const near = prev?.at !== undefined && m.at !== undefined ? m.at - prev.at < GROUP_MS : prev !== undefined
    const continued = !!prev && !newDay && !unread && !m.mine && !m.quote && prev.author.id === m.author.id && !prev.mine && near
    rows.push({ kind: 'message', id: m.id, message: m, continued, last: m.id === lastMine })
    prev = m
  }
  return rows
}

/** Quote text: whitespace collapsed, trimmed, at most 280 characters with an ellipsis (07 §5.5). */
export function excerpt(text: string, max = QUOTE_MAX) {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** What a quote of `m` carries: the selection, or the whole message; an attachment quotes as its file name. */
export const quoteText = (m: Pick<ChatMessage, 'text' | 'attachment'>, selection?: string) =>
  excerpt(selection?.trim() ? selection : m.text ? `${m.text}${m.attachment ? ` (${m.attachment.name})` : ''}` : m.attachment?.name ?? '')

export type TextPart = { mention: boolean; text: string; at: number }

/** Split a message into text and @mention runs. Only names in `names` count. */
export function textParts(text: string, names: readonly string[] = []): TextPart[] {
  if (!names.length) return [{ mention: false, text, at: 0 }]
  const by = [...names].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const parts: TextPart[] = []
  let from = 0
  for (const m of text.matchAll(new RegExp(`(^|\\s)(@(?:${by}))(?=$|[\\s.,!?:;])`, 'g'))) {
    const at = m.index + m[1].length
    if (at > from) parts.push({ mention: false, text: text.slice(from, at), at: from })
    parts.push({ mention: true, text: m[2], at })
    from = at + m[2].length
  }
  if (from < text.length) parts.push({ mention: false, text: text.slice(from), at: from })
  return parts
}

/** The @word the caret sits at the end of, or null. */
export function mentionQuery(value: string, caret: number) {
  const m = /(^|\s)@([\p{L}\p{N}_-]*)$/u.exec(value.slice(0, caret))
  return m ? { start: m.index + m[1].length, query: m[2] } : null
}

/** Replace the @word at the caret with `@name `; the new value and caret. */
export function insertMention(value: string, caret: number, name: string) {
  const q = mentionQuery(value, caret)
  const start = q ? q.start : caret
  const head = `${value.slice(0, start)}@${name} `
  return { value: head + value.slice(caret), caret: head.length }
}

/** "Thumbs up, 3: you, Ana, Kofi" (07 §5.2). */
export function reactionName(r: MessageReaction) {
  const names = r.names?.length ? r.names : r.mine ? ['you'] : []
  return `${r.label ?? r.emoji}, ${r.count}${names.length ? `: ${names.join(', ')}` : ''}`
}

export interface MessageLogOptions {
  /** Q or the Quote button; `selection` is the text picked inside that message. */
  onQuote(id: string, selection: string): void
  /** Every message in the log, rendered or not. */
  ids(): readonly string[]
  /** Render a message wherever it is, and focus it. */
  reveal(id: string): void
}

/**
 * The log's behaviour (07 §5.2, §5.5), over a window of rows: the window owns scrolling and sticking to the bottom, so
 * this is what a message does. Messages are one roving stop (↑/↓, Home/End), the focused one's toolbar joins the tab
 * order, Q quotes it. A tap shows a message's toolbar on touch. Delegates Quote, Copy text and Jump to original. New
 * nodes are watched, so a rendered row is enough.
 */
export function messageLog(log: HTMLElement, opts: MessageLogOptions) {
  let o = opts
  let picked = ''
  const doc = log.ownerDocument
  const all = () => [...log.querySelectorAll<HTMLElement>('[data-scope="message"]')].filter(m => !m.closest('[data-probe]'))
  const owner = (t: EventTarget | null) => (t as Element).closest<HTMLElement>('[data-scope="message"]')
  const stop = (el: HTMLElement, on: boolean) => { const to = on ? 0 : -1; if (el.tabIndex !== to) el.tabIndex = to }
  const rove = (m: HTMLElement | null | undefined) => {
    for (const x of all()) {
      stop(x, x === m)
      const open = x === m && x.contains(doc.activeElement) // only a focused message's toolbar is in the tab order
      for (const b of x.querySelectorAll<HTMLElement>('[data-part="actions"] button')) stop(b, open)
    }
  }
  const confirm = (m: Element) => installSweep(doc).confirm(m.querySelector('[data-part="bubble"]'))
  const quote = (m: HTMLElement) => {
    const text = m.querySelector('[data-part="text"]')
    const sel = doc.getSelection()
    const live = sel && !sel.isCollapsed && text?.contains(sel.anchorNode) ? sel.toString() : ''
    const selection = picked || live
    picked = ''
    o.onQuote(m.dataset.mid!, selection)
  }
  const land = (m: HTMLElement) => {
    m.scrollIntoView?.({ block: 'center', behavior: reducedMotion(m) ? 'auto' : 'smooth' })
    m.focus({ preventScroll: true })
    confirm(m)
    announce(doc, `Original message from ${m.getAttribute('aria-label')}`)
  }
  const byId = (id: string) => all().find(x => x.dataset.mid === id)
  const jump = (id: string) => {
    if (!o.ids().includes(id)) return announce(doc, 'Original message deleted')
    const m = byId(id)
    if (m) return land(m)
    o.reveal(id) // out of the window: it renders, then lands
    requestAnimationFrame(() => { const now = byId(id); if (now) land(now) })
  }
  const onKey = (e: KeyboardEvent) => {
    const m = e.target as HTMLElement
    if (m.dataset.scope !== 'message') return
    const ids = o.ids(), i = ids.indexOf(m.dataset.mid!)
    const to = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: ids.length - 1 } as Record<string, number>)[e.key]
    if (to !== undefined && ids[to] !== undefined) {
      e.preventDefault()
      const next = byId(ids[to])
      if (next) next.focus()
      else o.reveal(ids[to])
    }
    else if (e.key.toLowerCase() === 'q' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); quote(m) }
  }
  const onFocus = (e: FocusEvent) => { const m = owner(e.target); if (m) rove(m) }
  const onDown = (e: PointerEvent) => {
    if (!(e.target as Element).closest('[data-quote]')) return
    const s = doc.getSelection()
    picked = s && !s.isCollapsed ? s.toString() : ''
  }
  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || (e.target as Element).closest('button, a')) return
    const m = owner(e.target)
    for (const x of all()) if (x !== m) x.removeAttribute('data-actions')
    m?.toggleAttribute('data-actions')
  }
  const onClick = (e: MouseEvent) => {
    const t = e.target as Element
    const m = owner(t)
    if (t.closest('[data-quote]') && m) return quote(m)
    if (t.closest('[data-copytext]') && m) {
      void navigator.clipboard?.writeText(m.querySelector('[data-part="text"]')?.textContent ?? '').catch(() => {})
      confirm(m)
      return announce(doc, 'Message copied')
    }
    const j = t.closest<HTMLElement>('[data-jump]')
    if (j) jump(j.dataset.jump!)
  }
  const watch = new (doc.defaultView as any).MutationObserver((records: MutationRecord[]) => {
    if (!records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1))) return
    const focused = log.contains(doc.activeElement) ? owner(doc.activeElement) : null
    rove(focused ?? all().at(-1))
  })
  rove(all().at(-1))
  log.addEventListener('keydown', onKey)
  log.addEventListener('focusin', onFocus)
  log.addEventListener('pointerdown', onDown)
  log.addEventListener('pointerup', onUp)
  log.addEventListener('click', onClick)
  watch.observe(log, { childList: true, subtree: true })
  return {
    update(next: MessageLogOptions) { o = next },
    destroy() {
      watch.disconnect()
      log.removeEventListener('keydown', onKey)
      log.removeEventListener('focusin', onFocus)
      log.removeEventListener('pointerdown', onDown)
      log.removeEventListener('pointerup', onUp)
      log.removeEventListener('click', onClick)
    },
  }
}

// ---- cursors, follow, auto-track --------------------------------------------------------------------------------

export interface PeerCursor {
  /** The `data-anchor` value it is anchored to. */
  anchor: string
  /** Position inside the anchor's box, 0–1, so it lines up across viewport sizes. */
  x: number
  y: number
}
export type CursorPeer = Peer & { cursor?: PeerCursor | null }

const ARROW = 'M1 1l5.5 13 2-5.5L14 6.5z'
const CHEVRON = { top: 'M3 11l5-6 5 6z', bottom: 'M3 5l5 6 5-6z' }

/** Where a cursor sits in the layer: `over` is -1 or 1 when its anchor is off the layer's top or bottom edge. */
export function cursorPoint(anchor: { left: number; top: number; width: number; height: number }, base: { left: number; top: number; height: number }, c: Pick<PeerCursor, 'x' | 'y'>) {
  const x = anchor.left - base.left + anchor.width * c.x
  const y = anchor.top - base.top + anchor.height * c.y
  return { x, y, over: y < 0 ? -1 : y > base.height ? 1 : 0 }
}

export interface CursorsOptions { peers: readonly CursorPeer[]; anchor?: string; idle?: number }

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
      const c = o.peers.find(p => p.id === el.dataset.peer)?.cursor
      const to = c && anchors.find(a => a.dataset.anchor === c.anchor)
      el.hidden = !to
      if (!to || !c) continue
      const p = cursorPoint(to.getBoundingClientRect(), base, c)
      el.style.setProperty('--_x', `${Math.round(p.x)}px`)
      el.style.setProperty('--_y', `${Math.round(p.over ? (p.over < 0 ? 0 : base.height - 16) : p.y)}px`)
      el.querySelector('path')?.setAttribute('d', p.over ? CHEVRON[p.over < 0 ? 'top' : 'bottom'] : ARROW)
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
  const tick = () => { fade(); place() }
  const timer = setInterval(fade, 1000)
  win.addEventListener('scroll', place, { capture: true, passive: true })
  win.addEventListener('resize', place)
  tick()
  return {
    update(next: CursorsOptions) { o = next; queueMicrotask(tick) },
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
  const key = (e: KeyboardEvent) => { if (SCROLL_KEYS.has(e.key)) fn() }
  el.addEventListener('wheel', fn, { passive: true })
  el.addEventListener('touchmove', fn, { passive: true })
  el.addEventListener('keydown', key)
  return () => {
    el.removeEventListener('wheel', fn)
    el.removeEventListener('touchmove', fn)
    el.removeEventListener('keydown', key)
  }
}

const glide = (el: HTMLElement, top: number) => el.scrollTo?.({ top, behavior: reducedMotion(el) ? 'auto' : 'smooth' })

export interface FollowOptions { on: boolean; /** The followed viewport's top, 0–1 of the document. */ top?: number; onStop(): void }

/** Following (07 §6.1): the element rides the peer's viewport; any scroll of the user's, or Esc, stops it. */
export function followViewport(el: HTMLElement, opts: FollowOptions) {
  let o = opts
  const doc = el.ownerDocument
  const stop = () => { if (o.on) o.onStop() }
  const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) stop() }
  const ride = () => { if (o.on && o.top !== undefined) glide(el, o.top * el.scrollHeight) }
  const off = userScroll(el, stop)
  doc.addEventListener('keydown', onEsc)
  ride()
  return {
    update(next: FollowOptions) { o = next; ride() },
    destroy() { off(); doc.removeEventListener('keydown', onEsc) },
  }
}

export interface AutoTrackOptions { following: boolean; /** The `data-section` the presenter is in. */ section?: string; onPause(): void }

/** MultiplayerAutoTrack (07 §6.4): scroll to the presenter's section; a manual scroll pauses it and never fights. */
export function autoTrack(region: HTMLElement, opts: AutoTrackOptions) {
  let o = opts
  const go = () => {
    if (!o.following || !o.section) return
    const sec = [...region.querySelectorAll<HTMLElement>('[data-section]')].find(s => s.dataset.section === o.section)
    if (sec) glide(region, sec.offsetTop - region.offsetTop - 4)
  }
  const off = userScroll(region, () => { if (o.following) o.onPause() })
  go()
  return { update(next: AutoTrackOptions) { o = next; go() }, destroy: off }
}

// ---- kanban -----------------------------------------------------------------------------------------------------

export interface BoardCard { id: string; title: string }
export interface BoardColumn<C extends BoardCard = BoardCard> { id: string; title: string; limit?: number; color?: number; cards: C[] }
export type BoardSpot = { col: number; index: number }

export function findCard(columns: readonly BoardColumn<any>[], id: string): BoardSpot | null {
  for (let col = 0; col < columns.length; col++) {
    const index = columns[col].cards.findIndex(c => c.id === id)
    if (index >= 0) return { col, index }
  }
  return null
}

/** The board with card `id` in column `col` at `index`, clamped. A new board; the card object is kept. */
export function moveCard<C extends BoardCard>(columns: readonly BoardColumn<C>[], id: string, col: number, index: number): BoardColumn<C>[] {
  const from = findCard(columns, id)
  if (!from || !columns[col]) return [...columns]
  const card = columns[from.col].cards[from.index]
  return columns.map((c, i) => {
    const cards = c.cards.filter(x => x.id !== id)
    if (i === col) cards.splice(Math.max(0, Math.min(index, cards.length)), 0, card)
    return i === from.col || i === col ? { ...c, cards } : c
  })
}

const STEP: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/** Where an arrow key takes a card, or null at the edge of the board. Changing column keeps the row, clamped. */
export function stepCard(columns: readonly BoardColumn<any>[], id: string, key: string): BoardSpot | null {
  const at = findCard(columns, id), step = STEP[key]
  if (!at || !step) return null
  const col = at.col + step[0]
  if (!columns[col]) return null
  if (step[0]) return { col, index: Math.min(at.index, columns[col].cards.length) }
  const index = at.index + step[1]
  return index < 0 || index >= columns[col].cards.length ? null : { col, index }
}

/** "Moved X to Review, position 2 of 3" (06 §10). */
export function moveLine(columns: readonly BoardColumn<any>[], id: string) {
  const at = findCard(columns, id)
  if (!at) return ''
  const c = columns[at.col]
  return `Moved ${c.cards[at.index].title} to ${c.title}, position ${at.index + 1} of ${c.cards.length}`
}

export interface KanbanOptions {
  columns: () => readonly BoardColumn<any>[]
  /** Commit a move and render it before returning, so focus can follow the card. */
  onMove(id: string, col: number, index: number): void
  /** Render a card wherever it is in its column's window, and focus it. */
  focus(id: string): void
}

/**
 * The board's two non-menu move paths (07 §6.2, 06 §10), over columns that are windows: a card's `li` is a window row,
 * positioned by the list. Pointer: HTML drag-and-drop with a 4px placeholder laid over the list and a data-drop column. Keyboard: Alt + arrows moves at once; Space picks up, arrows move, Space drops, Escape puts it back.
 * Every move is announced by the caller's onMove; focus stays on the card.
 */
export function kanban(host: HTMLElement, opts: KanbanOptions) {
  let o = opts
  const doc = host.ownerDocument
  let drag: HTMLElement | null = null
  let lifted: { id: string; home: BoardSpot } | null = null
  const ph = doc.createElement('li')
  ph.dataset.part = 'placeholder'
  ph.setAttribute('aria-hidden', 'true')
  const cardEl = (id: string) => [...host.querySelectorAll<HTMLElement>('[data-part="card"]')].find(c => c.dataset.id === id && !c.closest('[data-probe]'))
  const lift = (on: boolean) => { if (lifted) cardEl(lifted.id)?.toggleAttribute('data-dragging', on) }
  const go = (id: string, col: number, index: number) => {
    o.onMove(id, col, index)
    o.focus(id)
    queueMicrotask(() => lift(true)) // the card renders in its new window first
  }
  const drop = () => { lift(false); lifted = null }
  const onKey = (e: KeyboardEvent) => {
    const card = e.target as HTMLElement
    if (card.dataset.part !== 'card') return
    const id = card.dataset.id!
    if (e.key === ' ' && !e.altKey) {
      e.preventDefault()
      const title = card.getAttribute('aria-label')
      if (lifted) { announce(doc, `Dropped ${title}`); return drop() }
      const home = findCard(o.columns(), id)
      if (!home) return
      lifted = { id, home }
      lift(true)
      return announce(doc, `Picked up ${title}. Arrow keys move it, Space drops it, Escape puts it back.`)
    }
    if (e.key === 'Escape' && lifted) {
      e.preventDefault()
      const { id: was, home } = lifted
      go(was, home.col, home.index)
      return drop()
    }
    if (!STEP[e.key] || !(e.altKey || lifted)) return
    e.preventDefault()
    const to = stepCard(o.columns(), id, e.key)
    if (to) go(id, to.col, to.index)
  }
  const onBlur = (e: FocusEvent) => { if (lifted && (e.target as HTMLElement).dataset?.id === lifted.id && !host.contains(e.relatedTarget as Node)) drop() }
  const columnOf = (t: EventTarget | null) => (t as Element).closest<HTMLElement>('[data-part="column"]')
  const onStart = (e: DragEvent) => {
    drag = (e.target as Element).closest<HTMLElement>('[data-part="card"]')
    if (!drag || !e.dataTransfer) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', drag.dataset.id!)
    const held = drag
    requestAnimationFrame(() => held.setAttribute('data-dragging', ''))
  }
  const onOver = (e: DragEvent) => {
    const col = columnOf(e.target)
    if (!col || !drag) return
    e.preventDefault()
    for (const c of host.querySelectorAll('[data-part="column"]')) c.toggleAttribute('data-drop', c === col)
    const ol = col.querySelector('ol')!
    const rows = [...ol.querySelectorAll<HTMLElement>('[data-part="row"]:not([data-probe])')].filter(li => !li.contains(drag)).sort((a, b) => Number(a.getAttribute('aria-posinset')) - Number(b.getAttribute('aria-posinset')))
    const after = rows.find(li => { const r = li.getBoundingClientRect(); return e.clientY < r.top + r.height / 2 })
    const edge = after?.getBoundingClientRect().top ?? rows.at(-1)?.getBoundingClientRect().bottom
    const at = (edge ?? ol.getBoundingClientRect().top) - ol.getBoundingClientRect().top
    ph.style.cssText = `position:absolute;inset-inline:0;inset-block-start:0;transform:translateY(${after ? at - 6 : at + 2}px)`
    ph.dataset.before = after?.getAttribute('aria-posinset') ?? ''
    if (ph.parentElement !== ol) ol.append(ph)
  }
  const onDrop = (e: DragEvent) => {
    if (!drag || !ph.parentElement) return
    e.preventDefault()
    const ol = ph.parentElement
    const col = [...host.querySelectorAll('[data-part="column"]')].indexOf(ol.closest('[data-part="column"]')!)
    const id = drag.dataset.id!
    const all = o.columns(), from = findCard(all, id)
    const before = ph.dataset.before ? Number(ph.dataset.before) - 1 : all[col].cards.length
    const index = from?.col === col && from.index < before ? before - 1 : before
    ph.remove()
    o.onMove(id, col, index)
    o.focus(id)
    requestAnimationFrame(() => { const landed = cardEl(id); if (landed) installSweep(doc).confirm(landed) })
  }
  const onEnd = () => {
    drag?.removeAttribute('data-dragging')
    drag = null
    ph.remove()
    for (const c of host.querySelectorAll('[data-part="column"]')) c.removeAttribute('data-drop')
  }
  host.addEventListener('keydown', onKey)
  host.addEventListener('focusout', onBlur)
  host.addEventListener('dragstart', onStart)
  host.addEventListener('dragover', onOver)
  host.addEventListener('drop', onDrop)
  host.addEventListener('dragend', onEnd)
  return {
    update(next: KanbanOptions) { o = next },
    destroy() {
      host.removeEventListener('keydown', onKey)
      host.removeEventListener('focusout', onBlur)
      host.removeEventListener('dragstart', onStart)
      host.removeEventListener('dragover', onOver)
      host.removeEventListener('drop', onDrop)
      host.removeEventListener('dragend', onEnd)
    },
  }
}

// ---- synced form, data integrity --------------------------------------------------------------------------------

export interface FormOp { seq: number; name: string; value: string | boolean; peer: Peer }
export interface SyncedFormOptions {
  /** Remote edits, oldest first. Each `seq` applies once; an older one is dropped. */
  ops: readonly FormOp[]
  onSend?(name: string, value: string | boolean): void
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
  const rootOf = (el: Element) => el.closest<HTMLElement>('[data-scope="field"], [data-scope="switch"]') ?? (el as HTMLElement)
  const tagOf = (op: FormOp, el: Element) => {
    const root = rootOf(el)
    let tag = form.querySelector<HTMLElement>(`[data-tag="${op.name}"]`)
    if (!tag) {
      tag = doc.createElement('span')
      tag.dataset.part = 'peer-tag'
      tag.dataset.tag = op.name
      root.after(tag)
    }
    tag.dataset.presenceColor = String(peerColor(op.peer))
    tag.hidden = false
    return tag
  }
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
    timers.set(op.name, setTimeout(() => { tag.hidden = true; root.removeAttribute('data-remote') }, o.hold ?? REMOTE_MS))
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
    update(next: SyncedFormOptions) { o = next; take() },
    destroy() {
      for (const t of timers.values()) clearTimeout(t)
      form.removeEventListener('input', onInput)
      form.removeEventListener('focusout', onLeave)
    },
  }
}

export interface IntegrityStats { sent: number; received: number; duplicate: number; outOfOrder: number; lagP95: number }

/** The value at the 95th percentile, 0 for none. */
export function p95(values: readonly number[]) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]
}

/** The counts DataIntegrity shows: feed it what a channel sends and receives. `receive` says what became of a seq. */
export function integrityCounter(window = 60) {
  let stats: IntegrityStats = { sent: 0, received: 0, duplicate: 0, outOfOrder: 0, lagP95: 0 }
  let lags: number[] = []
  let top = 0
  const seen = new Set<number>()
  return {
    get stats() { return stats },
    send() { stats = { ...stats, sent: stats.sent + 1 } },
    receive(seq: number, lag: number): 'ok' | 'duplicate' | 'out-of-order' {
      lags = [...lags, lag].slice(-window)
      const fate = seen.has(seq) ? 'duplicate' : seq < top ? 'out-of-order' : 'ok'
      seen.add(seq)
      top = Math.max(top, seq)
      stats = { ...stats, received: stats.received + 1, duplicate: stats.duplicate + (fate === 'duplicate' ? 1 : 0), outOfOrder: stats.outOfOrder + (fate === 'out-of-order' ? 1 : 0), lagP95: p95(lags) }
      return fate
    },
    reset() { stats = { sent: 0, received: 0, duplicate: 0, outOfOrder: 0, lagP95: 0 }; lags = []; top = 0; seen.clear() },
  }
}
