// The warp-core half of the live pack (07 §0, §3, §4): pure logic and actions, no framework.
import { nextIndex } from './focus'

// -- arrivals (07 §0): shared by every list that receives things the user didn't ask for -------------------------------

/** The ids in `next` that `seen` doesn't hold, in order; adds them to `seen`. A first render passes its ids to the Set. */
export function freshIds(seen: Set<string>, next: Iterable<string>) {
  const fresh: string[] = []
  for (const id of next) if (!seen.has(id)) { seen.add(id); fresh.push(id) }
  return fresh
}

export interface ArrivalOptions {
  /** The rows inside the host. Default: every child with a [data-id]. */
  items?: string
  /** Every id in the data, for a filtered list: an id already known when it comes into view doesn't count as new. */
  ids?: string[]
  /** How long data-arrive stays on, longer than the arrival itself (ms). */
  hold?: number
  /** Fires once per batch with the new ids (an inbox counts them for "n new"). */
  onArrive?(ids: string[]): void
}

/**
 * Keyed-list arrivals as an action (07 §0, §4.5): only ids not seen before get `data-arrive`, which comes off again
 * after the arrival so a later sort cannot replay it. What is rendered when the action attaches is the first render
 * and never animates. Writes to no other attribute, so a keyed renderer keeps patching the same nodes.
 */
export function arrivals(el: HTMLElement, opts: ArrivalOptions = {}) {
  let o = opts
  const win = el.ownerDocument.defaultView!
  const rows = () => [...el.querySelectorAll<HTMLElement>(o.items ?? ':scope > [data-id]')]
  const rendered = () => rows().map(r => r.dataset.id!).filter(Boolean)
  const seen = new Set<string>([...rendered(), ...(o.ids ?? [])])
  const pending = new Set<string>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const fire = (ids: string[]) => { if (ids.length) o.onArrive?.(ids) }
  const mark = () => {
    const nodes = rows()
    const take = o.ids ? nodes.filter(r => pending.has(r.dataset.id!)) : nodes.filter(r => !seen.has(r.dataset.id!))
    for (const r of take) {
      seen.add(r.dataset.id!)
      pending.delete(r.dataset.id!)
      r.setAttribute('data-arrive', '')
      const t = setTimeout(() => { timers.delete(t); r.removeAttribute('data-arrive') }, o.hold ?? 2400)
      timers.add(t)
    }
    if (!o.ids) fire(take.map(r => r.dataset.id!))
  }
  const observer = new win.MutationObserver(mark)
  observer.observe(el, { childList: true, subtree: true })
  return {
    update(next: ArrivalOptions = {}) {
      o = next
      if (!o.ids) return
      const fresh = freshIds(seen, o.ids)
      fresh.forEach(id => pending.add(id))
      fire(fresh)
      mark()
      // an arrival filtered out of view stays out: it was known by the time it shows
      if (fresh.length) timers.add(setTimeout(() => { mark(); pending.clear() }, 0))
    },
    destroy() {
      observer.disconnect()
      timers.forEach(clearTimeout)
    },
  }
}

/** Re-runs a one-shot CSS bump on `el` by replacing `attr`; the bell's badge, once per batch. */
export function bump(el: Element, attr = 'data-bump') {
  el.removeAttribute(attr)
  void (el as HTMLElement).offsetWidth
  el.setAttribute(attr, '')
}

// -- notifications (07 §4) ---------------------------------------------------------------------------------------------

export type InboxTab = 'all' | 'unread' | 'mentions'
export interface NoteLike { id: string; read?: boolean; kind?: string; day?: string }

export const filterNotes = <T extends NoteLike>(items: readonly T[], tab: InboxTab) =>
  items.filter(n => tab === 'all' || (tab === 'unread' ? !n.read : n.kind === 'mention'))

export const unreadCount = (items: readonly NoteLike[]) => items.filter(n => !n.read).length

/** Items by their `day` label, in order of first appearance (a list is newest first). */
export function groupByDay<T extends { day?: string }>(items: readonly T[], fallback = 'Today') {
  const days = new Map<string, T[]>()
  for (const n of items) {
    const d = n.day ?? fallback
    if (!days.has(d)) days.set(d, [])
    days.get(d)!.push(n)
  }
  return [...days].map(([day, rows]) => ({ day, rows }))
}

/** "Today", "Yesterday", else the date, for an ISO day against `today` (ISO too: the caller owns the clock). */
export function dayLabel(iso: string, today: string, locale = 'en-US') {
  const at = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  const days = Math.round((at(today) - at(iso)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(at(iso))
}

/** The bell's name and badge text. */
export const bellLabel = (count: number) => (count ? `Notifications, ${count} unread` : 'Notifications')
export const bellCount = (count: number) => (count > 9 ? '9+' : String(count))

/**
 * APG feed keys as an action: Page Down/Up between `items`, Ctrl+Home/End out of the feed (to the first focusable
 * before it, and after it); arrows step too, as the specimen's list does. Focus moves; the caller keeps the tab stop.
 */
export function feed(el: HTMLElement, opts: { items: string }) {
  let o = opts
  const doc = el.ownerDocument
  const onKey = (e: KeyboardEvent) => {
    const rows = [...el.querySelectorAll<HTMLElement>(o.items)]
    const at = rows.findIndex(r => r === e.target || r.contains(e.target as Node))
    if (at < 0) return
    const step = e.key === 'PageDown' || e.key === 'ArrowDown' ? 1 : e.key === 'PageUp' || e.key === 'ArrowUp' ? -1 : 0
    if (step) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target !== rows[at]) return
      e.preventDefault()
      rows[at + step]?.focus()
      return
    }
    if (e.ctrlKey && (e.key === 'Home' || e.key === 'End')) {
      const all = [...doc.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
      const outside = all.filter(n => !el.contains(n))
      const beyond = e.key === 'Home'
        ? outside.filter(n => n.compareDocumentPosition(el) & 4).at(-1)
        : outside.find(n => n.compareDocumentPosition(el) & 2)
      if (beyond) { e.preventDefault(); beyond.focus() }
    }
  }
  el.addEventListener('keydown', onKey)
  return { update: (next: typeof opts) => void (o = next), destroy: () => el.removeEventListener('keydown', onKey) }
}

/**
 * Calls `onRead(id)` for a row that has stayed visible in the scroller for `hold` ms (07 §4.2: 2 s visible in the
 * inbox), while `active`. Rows are found afresh: a keyed list inserts them under it. Without IntersectionObserver
 * (a server, an old test environment) it does nothing: reading stays explicit.
 */
export function readOnView(el: HTMLElement, opts: { items: string; active?: boolean; hold?: number; onRead(id: string): void }) {
  let o = opts
  const win = el.ownerDocument.defaultView as (Window & typeof globalThis) | null
  if (!win?.IntersectionObserver) return { update: (n: typeof opts) => void (o = n), destroy() {} }
  const timers = new Map<Element, ReturnType<typeof setTimeout>>()
  const stop = (row: Element) => { clearTimeout(timers.get(row)); timers.delete(row) }
  const io = new win.IntersectionObserver(entries => {
    for (const e of entries) {
      const row = e.target as HTMLElement
      if (!e.isIntersecting || !o.active || row.hasAttribute('data-read')) { stop(row); continue }
      if (!timers.has(row)) timers.set(row, setTimeout(() => { timers.delete(row); o.onRead(row.dataset.id!) }, o.hold ?? 2000))
    }
  }, { root: el, threshold: 0.6 })
  const watchRows = () => { for (const r of el.querySelectorAll(o.items)) io.observe(r) }
  const mo = new win.MutationObserver(watchRows)
  mo.observe(el, { childList: true, subtree: true })
  watchRows()
  const clear = () => { for (const t of timers.values()) clearTimeout(t); timers.clear() }
  return {
    update(next: typeof opts) {
      const was = o.active
      o = next
      if (o.active === was) return
      clear()
      if (o.active) { io.disconnect(); watchRows() }
    },
    destroy() { io.disconnect(); mo.disconnect(); clear() },
  }
}

export interface NotifyItem { id?: string; title: string; description?: string; tone?: 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info'; urgent?: boolean; action?: { label: string; onClick(): void } }
export interface NotifyPolicyOptions {
  /** Is the inbox on screen? Then nothing toasts and arrivals are only announced. */
  open(): boolean
  show(t: NotifyItem & { id?: string }): string
  dismiss(id: string): void
  announce(text: string, assertive?: boolean): void
  /** How many arrivals inside `quiet` make a burst. */
  burst?: number
  /** A burst ends after this long with no arrival; it is also the announcement's collapse window (07 §0). */
  quiet?: number
  /** At most this many toasts from this policy are up at once. */
  max?: number
  /** "3 new notifications". */
  summary?(n: number): string
}

/**
 * The toast policy (07 §4.2): inbox open, no toast; closed, one toast per item, three at most, and a burst collapses
 * into one "n new notifications" toast. An open inbox announces instead, one sentence after `quiet` ms of quiet;
 * urgent items announce assertively at once. Toasts announce themselves through the Toaster.
 */
export function notifyPolicy(o: NotifyPolicyOptions) {
  const burst = o.burst ?? 3
  const quiet = o.quiet ?? 1000
  const max = o.max ?? 3
  const summary = o.summary ?? ((n: number) => `${n} new notifications`)
  let run: { n: number; texts: string[]; ids: string[]; collapsed?: string } = { n: 0, texts: [], ids: [] }
  let up: string[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  const settle = () => {
    timer = undefined
    if (o.open() && run.n) o.announce(run.n === 1 ? `New notification: ${run.texts[0]}` : summary(run.n))
    run = { n: 0, texts: [], ids: [] }
  }
  const flush = () => { if (timer !== undefined) { clearTimeout(timer); settle() } }
  return {
    push(item: NotifyItem) {
      clearTimeout(timer)
      timer = setTimeout(settle, quiet)
      if (o.open()) {
        if (item.urgent) o.announce(item.title, true)
        else { run.n++; run.texts.push(item.title) }
        return
      }
      run.n++
      if (run.n >= burst) {
        for (const id of run.ids) { o.dismiss(id); up = up.filter(x => x !== id) }
        run.ids = []
        run.collapsed = o.show({ id: run.collapsed, title: summary(run.n), tone: 'neutral' })
        if (!up.includes(run.collapsed)) up.push(run.collapsed)
        return
      }
      const id = o.show(item)
      run.ids.push(id)
      up.push(id)
      while (up.length > max) o.dismiss(up.shift()!)
    },
    flush,
    destroy() { clearTimeout(timer); timer = undefined },
  }
}

// -- connection status (07 §4.4) ---------------------------------------------------------------------------------------

export type LiveState = 'connecting' | 'live' | 'reconnecting' | 'offline'

/** `.live`, `stream().status` and `channel.status`, mapped to the four states (07 §4.5, §4.7). */
export function liveState(status: string | undefined | null): LiveState {
  switch (status) {
    case 'live': case 'open': case 'streaming': case 'done': return 'live'
    case 'reconnecting': return 'reconnecting'
    case 'offline': case 'closed': case 'unauthorized': case 'error': return 'offline'
    default: return 'connecting'
  }
}

/** The worst of several states: offline, reconnecting, connecting, live. */
export const worstLive = (states: readonly LiveState[]): LiveState => (['offline', 'reconnecting', 'connecting', 'live'] as const).find(s => states.includes(s)) ?? 'connecting'

/** What a move between states says, if anything (07 §4.4): `queued` is the one summary on the way back. */
export function connectionAnnouncement(prev: LiveState | undefined, next: LiveState, queued = 0): { text: string; assertive?: boolean } | null {
  if (prev === next) return null
  if (next === 'offline') return { text: "You're offline. Showing saved data.", assertive: true }
  if (next === 'reconnecting' && prev === 'live') return { text: 'Connection lost. Reconnecting.' }
  if (next === 'live' && (prev === 'offline' || prev === 'reconnecting')) return { text: `Back online.${queued ? ` ${queued} ${queued === 1 ? 'update' : 'updates'}.` : ''}` }
  return null
}

// -- notification preferences (07 §4.6) --------------------------------------------------------------------------------

export type PrefValues = Record<string, Record<string, boolean>>
export interface PrefEvent { id: string; label: string; hint?: string; instant?: boolean }
export interface PrefGroup { id: string; label: string; events: PrefEvent[] }
export interface PrefRules { offered?: Record<string, string[]>; locked?: Record<string, string[]> }
export interface PrefChange { event: string; channel: string; on: boolean }
export type PrefCell = 'on' | 'off' | 'locked' | 'na'
export type TriState = 'on' | 'off' | 'mixed'

const isOffered = (r: PrefRules, ev: string, ch: string) => !r.offered?.[ev] || r.offered[ev].includes(ch)
const isLocked = (r: PrefRules, ev: string, ch: string) => !!r.locked?.[ev]?.includes(ch)

export function prefCell(v: PrefValues, rules: PrefRules, event: string, channel: string): PrefCell {
  if (isLocked(rules, event, channel)) return 'locked'
  if (!isOffered(rules, event, channel)) return 'na'
  return v[event]?.[channel] ? 'on' : 'off'
}

/** The channels' offered, unlocked cells among `events`: what a group or channel toggle moves. */
export const movable = (events: readonly PrefEvent[], rules: PrefRules, channel: string) =>
  events.filter(e => isOffered(rules, e.id, channel) && !isLocked(rules, e.id, channel))

/** A parent toggle's state; null when no cell below can move ("not offered"). */
export function triState(v: PrefValues, events: readonly PrefEvent[], rules: PrefRules, channel: string): TriState | null {
  const cells = movable(events, rules, channel)
  if (!cells.length) return null
  const on = cells.filter(e => v[e.id]?.[channel]).length
  return on === 0 ? 'off' : on === cells.length ? 'on' : 'mixed'
}

/** The changes a parent toggle makes: mixed goes to all on (the native behaviour). */
export function toggleChanges(v: PrefValues, events: readonly PrefEvent[], rules: PrefRules, channel: string): PrefChange[] {
  const on = triState(v, events, rules, channel) !== 'on'
  return movable(events, rules, channel).map(e => ({ event: e.id, channel, on }))
}

export function applyPrefs(v: PrefValues, changes: readonly PrefChange[]): PrefValues {
  const next = { ...v }
  for (const c of changes) next[c.event] = { ...next[c.event], [c.channel]: c.on }
  return next
}

/**
 * The APG grid as an action (07 §4.6): one tab stop; arrows move by cell, Home/End along the row, Ctrl+Home/End to the
 * corners. `targets` picks the focusable in each cell; a row's targets line up by index, "not offered" cells included.
 */
export function gridNav(el: HTMLElement, opts: { rows?: string; targets: string }) {
  let o = opts
  const grid = () => [...el.querySelectorAll<HTMLElement>(o.rows ?? '[role="row"]')].map(r => [...r.querySelectorAll<HTMLElement>(o.targets)])
  const rove = (t: HTMLElement) => { for (const row of grid()) for (const x of row) x.tabIndex = x === t ? 0 : -1 }
  const onKey = (e: KeyboardEvent) => {
    const g = grid()
    let r = g.findIndex(row => row.includes(e.target as HTMLElement))
    if (r < 0) return
    let c = g[r].indexOf(e.target as HTMLElement)
    const rtl = getComputedStyle(el).direction === 'rtl'
    const ctrl = e.ctrlKey || e.metaKey
    const last = g.length - 1
    const end = g[r].length - 1
    if (e.key === 'ArrowRight') c += rtl ? -1 : 1
    else if (e.key === 'ArrowLeft') c += rtl ? 1 : -1
    else if (e.key === 'ArrowDown') r++
    else if (e.key === 'ArrowUp') r--
    else if (e.key === 'Home') { c = 0; if (ctrl) r = 0 }
    else if (e.key === 'End') { c = end; if (ctrl) r = last }
    else return
    e.preventDefault()
    r = Math.max(0, Math.min(last, r))
    c = Math.max(0, Math.min(end, c))
    const t = g[r][c]
    rove(t)
    t.focus()
  }
  const onFocus = (e: FocusEvent) => { if ((e.target as Element).matches?.(o.targets)) rove(e.target as HTMLElement) }
  el.addEventListener('keydown', onKey)
  el.addEventListener('focusin', onFocus)
  return {
    update: (next: typeof opts) => void (o = next),
    destroy() { el.removeEventListener('keydown', onKey); el.removeEventListener('focusin', onFocus) },
  }
}

// -- meetings (07 §3) --------------------------------------------------------------------------------------------------

export interface ParticipantLike { id: string; name: string; role?: string; isSpeaking?: boolean; isMuted?: boolean; handRaised?: boolean; network?: 'good' | 'poor' }

/** "Kofi Mensah, host, speaking" / "Ana Ruiz, muted" (07 §3.4). */
export function tileLabel(p: ParticipantLike) {
  return [p.name, p.role, p.isSpeaking && 'speaking', p.isMuted && 'muted', p.handRaised && 'hand raised', p.network === 'poor' && 'poor connection'].filter(Boolean).join(', ')
}

/** A stable data-palette slot (1 to 8) for an id; the server and the client agree. */
export function hueOf(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (h % 8) + 1
}

/** Gallery columns by head count (07 §3.1); the container takes it to 2 below 600. */
export const galleryCols = (n: number) => (n <= 4 ? 2 : n <= 9 ? 3 : 4)

/** Who raised a hand since `prev` (07 §3.4: hands are announced, speakers aren't). */
export const newHands = (prev: readonly ParticipantLike[], next: readonly ParticipantLike[]) =>
  next.filter(p => p.handRaised && !prev.find(q => q.id === p.id)?.handRaised)

/**
 * Follows the active speaker with a hold, to avoid flicker (07 §3.2: 1.5 s): a new speaker takes over only if they are
 * still the one speaking when the hold runs out, and only once the current one has held the stage that long.
 */
export function speakerFollow(onChange: (id: string) => void, { hold = 1500, now = () => Date.now() }: { hold?: number; now?: () => number } = {}) {
  let current: string | undefined
  let since = 0
  let wanted: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const take = (id: string) => { current = id; since = now(); wanted = undefined; onChange(id) }
  return {
    get current() { return current },
    update(id: string | undefined) {
      if (id === undefined || id === current) { wanted = undefined; clearTimeout(timer); timer = undefined; return }
      if (current === undefined) return take(id)
      if (id === wanted) return
      wanted = id
      clearTimeout(timer)
      timer = setTimeout(() => { timer = undefined; if (wanted === id) take(id) }, Math.max(0, since + hold - now()))
    },
    destroy() { clearTimeout(timer) },
  }
}

/** The ring's way out (07 §3.2): when `on` goes false, `data-speaking-out` holds until the sweep has left. */
export function speakingOut(el: HTMLElement, on: boolean | undefined) {
  let was = !!on
  let timer: ReturnType<typeof setTimeout> | undefined
  const set = (next: boolean | undefined) => {
    if (was && !next) {
      el.setAttribute('data-speaking-out', '')
      clearTimeout(timer)
      const ms = parseFloat(getComputedStyle(el, '::after').transitionDuration) * 1000 || 250
      timer = setTimeout(() => el.removeAttribute('data-speaking-out'), ms + 40)
    } else if (next) { clearTimeout(timer); el.removeAttribute('data-speaking-out') }
    was = !!next
  }
  return { update: set, destroy: () => clearTimeout(timer) }
}

/** Off-screen tiles pause their <video> (07 §3.2); only what this paused plays again. */
export function pauseOffscreen(el: HTMLElement) {
  const win = el.ownerDocument.defaultView as (Window & typeof globalThis) | null
  if (!win?.IntersectionObserver) return { update() {}, destroy() {} }
  const paused = new WeakSet<HTMLVideoElement>()
  const io = new win.IntersectionObserver(entries => {
    for (const e of entries) {
      const v = e.target as HTMLVideoElement
      if (!e.isIntersecting && !v.paused) { paused.add(v); v.pause() }
      else if (e.isIntersecting && paused.has(v)) { paused.delete(v); void v.play()?.catch(() => {}) }
    }
  }, { root: el })
  const scan = () => { for (const v of el.querySelectorAll('video')) io.observe(v) }
  const mo = new win.MutationObserver(scan)
  mo.observe(el, { childList: true, subtree: true })
  scan()
  return { update() {}, destroy() { io.disconnect(); mo.disconnect() } }
}

export type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
/** The corner an arrow key sends the self view to. */
export function pipStep(corner: PipCorner, key: string): PipCorner {
  const [y, x] = corner.split('-')
  const to = key === 'ArrowUp' ? `top-${x}` : key === 'ArrowDown' ? `bottom-${x}` : key === 'ArrowLeft' ? `${y}-left` : key === 'ArrowRight' ? `${y}-right` : corner
  return to as PipCorner
}

/**
 * The self view (07 §3.1): drag it, it snaps to the nearest corner of its stage; arrow keys move it corner to corner
 * (the non-drag path). It rests bottom right (the CSS), through `--_px`/`--_py`; `corner` is where it starts.
 */
export function pip(el: HTMLElement, opts: { corner?: PipCorner; onMove?(corner: PipCorner): void } = {}) {
  let o = opts
  let corner: PipCorner = 'bottom-right'
  const rtl = () => getComputedStyle(el).direction === 'rtl'
  const snap = (c: PipCorner, quiet = false) => {
    corner = c
    const stage = (el.offsetParent ?? el.parentElement!) as HTMLElement
    const s = stage.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    const k = b.width / (el.offsetWidth || b.width) || 1
    const left = c.endsWith('left')
    const maxX = (s.width - b.width) / k - 32
    const maxY = (s.height - b.height) / k - 96
    el.style.setProperty('--_px', `${rtl() ? (left ? 0 : maxX) : left ? -maxX : 0}px`)
    el.style.setProperty('--_py', `${c.startsWith('top') ? -maxY : 0}px`)
    if (!quiet) o.onMove?.(c)
  }
  let drag: { x: number; y: number; px: number; py: number } | null = null
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest?.('button')) return
    el.setPointerCapture?.(e.pointerId)
    el.setAttribute('data-dragging', '')
    const css = el.style
    drag = { x: e.clientX, y: e.clientY, px: parseFloat(css.getPropertyValue('--_px')) || 0, py: parseFloat(css.getPropertyValue('--_py')) || 0 }
  }
  const onMove = (e: PointerEvent) => {
    if (!drag) return
    const k = el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1
    el.style.setProperty('--_px', `${drag.px + (e.clientX - drag.x) / k}px`)
    el.style.setProperty('--_py', `${drag.py + (e.clientY - drag.y) / k}px`)
  }
  const onUp = () => {
    if (!drag) return
    drag = null
    el.removeAttribute('data-dragging')
    const s = (el.offsetParent ?? el.parentElement!).getBoundingClientRect()
    const b = el.getBoundingClientRect()
    const left = b.left + b.width / 2 < s.left + s.width / 2
    const top = b.top + b.height / 2 < s.top + s.height / 2
    snap(`${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`)
  }
  const onKey = (e: KeyboardEvent) => {
    const to = pipStep(corner, e.key)
    if (!e.key.startsWith('Arrow')) return
    e.preventDefault()
    if (to !== corner) snap(to)
  }
  const on: [string, (e: any) => void][] = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp], ['keydown', onKey]]
  for (const [t, fn] of on) el.addEventListener(t, fn)
  if (o.corner && o.corner !== corner) snap(o.corner, true)
  return {
    update(next: typeof opts) { o = next; if (o.corner && o.corner !== corner) snap(o.corner, true) },
    destroy() { for (const [t, fn] of on) el.removeEventListener(t, fn) },
  }
}

/** A reaction floating up from the control bar and fading (07 §3.2); it just fades under reduced motion. */
export function floatReaction(stage: HTMLElement, emoji: string) {
  const doc = stage.ownerDocument
  const e = doc.createElement('span')
  e.setAttribute('aria-hidden', 'true')
  e.textContent = emoji
  e.style.cssText = 'position:absolute;inset-inline-start:50%;inset-block-end:20px;font-size:32px;z-index:500;pointer-events:none'
  stage.append(e)
  const still = doc.documentElement.dataset.motion === 'reduce' || doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const run = e.animate?.([{ translate: '0 0', opacity: 1 }, { translate: `0 ${still ? 0 : -180}px`, opacity: 0 }], { duration: 1400, easing: 'ease-out', fill: 'forwards' })
  if (run) run.onfinish = () => e.remove()
  else setTimeout(() => e.remove(), 1400)
  return e
}

/** Bars lit for a level from 0 to 1. */
export const litBars = (level: number, bars = 16) => Math.max(0, Math.min(bars, Math.round(level * bars)))

/**
 * A segmented meter that reads `--level` off its own style, so the caller's 10 Hz updates never re-render (07 §3.4):
 * it lights the bars (`i[data-on]`) and keeps `aria-valuenow` true.
 */
export function levelMeter(el: HTMLElement) {
  const win = el.ownerDocument.defaultView!
  const bars = [...el.querySelectorAll('i')]
  const read = () => {
    const n = litBars(parseFloat(el.style.getPropertyValue('--level')) || 0, bars.length)
    bars.forEach((b, i) => b.toggleAttribute('data-on', i < n))
    el.setAttribute('aria-valuenow', String(n))
  }
  const mo = new win.MutationObserver(read)
  mo.observe(el, { attributes: true, attributeFilter: ['style'] })
  read()
  return { update: read, destroy: () => mo.disconnect() }
}

/** Minutes and seconds (hours once there are any) left, zero-padded; never below zero. */
export function countdownParts(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const parts = [{ unit: 'min', value: pad(Math.floor((s % 3600) / 60)) }, { unit: 'sec', value: pad(s % 60) }]
  return h ? [{ unit: 'hr', value: pad(h) }, ...parts] : parts
}
export const countdownLabel = (ms: number) => {
  const m = Math.ceil(Math.max(0, ms) / 60000)
  return `Starts in ${m} ${m === 1 ? 'minute' : 'minutes'}`
}

// -- transport picker (07 §4.7) ----------------------------------------------------------------------------------------

export type TransportWire = 'default' | 'tabs' | 'fake'
export type TransportBus = 'memory' | 'postgres' | 'redis' | 'nats' | 'durable-object'
export type TransportPreset = 'single' | 'multi' | 'cf'
export type TransportNetwork = 'good' | 'slow' | 'lossy' | 'wsblock' | 'offline'
export type LaneId = 'live' | 'stream' | 'channel'
export interface TransportConfig { wire: TransportWire; bus: TransportBus; preset: TransportPreset; network: TransportNetwork }

export const BUS_MS: Record<TransportBus, number> = { memory: 0, postgres: 4, redis: 2, nats: 1, 'durable-object': 8 }

/** The build's own check (07 §4.7): null when the pair is valid. */
export function transportError(c: Pick<TransportConfig, 'wire' | 'bus' | 'preset'>) {
  if (c.wire !== 'default') return null
  if (c.bus === 'memory' && c.preset === 'multi') return { title: 'R002 · memory bus on a multi-instance preset', description: 'Each instance would only see its own events. Use postgres, redis or nats.' }
  return null
}

/** Nearest-rank percentile; null on no samples. */
export function percentile(xs: readonly number[], p: number) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}
export const latencyTone = (ms: number | null) => (ms === null ? undefined : ms >= 1000 ? 'critical' : ms >= 250 ? 'caution' : undefined)
export const formatMs = (ms: number | null) => (ms === null ? '—' : ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`)
/** Full-jitter backoff: attempt n waits a random time up to min(30 s, 0.5 s × 2ⁿ). */
export const backoffCap = (attempt: number) => Math.min(30, 0.5 * 2 ** attempt)

export interface SimLane { state: LiveState; samples: number[]; cursor: string; wire: string; note: string }
export interface SimLog { at: number; who: string; text: string }
export interface SimEnv { random?: () => number; now?: () => number; pace?: (ms: number) => number }
type Conn = { state: LiveState; attempt: number; retryAt: number; epoch: number; seq: number; behind: boolean; timer?: ReturnType<typeof setTimeout> }

const LANES: [LaneId, string, 'sse' | 'ws'][] = [['live', '.live', 'sse'], ['stream', 'stream', 'sse'], ['channel', 'channel', 'ws']]

/**
 * The sandbox's model of weft's wires (07 §4.7): no real connection, the documented behaviour under a chosen network.
 * States, backoff, cursors, resume and reset run on timers; `tick()` is the 2 s heartbeat, which the caller pauses
 * when the card is off screen. `subscribe` fires on every change.
 */
export function transportSim(initial: TransportConfig, env: SimEnv = {}) {
  const rnd = env.random ?? Math.random
  const now = env.now ?? (() => performance.now())
  const pace = env.pace ?? ((ms: number) => ms)
  const start = now()
  let cfg = { ...initial }
  const conns: Record<'sse' | 'ws', Conn> = { sse: { state: 'connecting', attempt: 0, retryAt: 0, epoch: 7, seq: 138, behind: false }, ws: { state: 'connecting', attempt: 0, retryAt: 0, epoch: 7, seq: 52, behind: false } }
  const samples: Record<LaneId, number[]> = { live: [], stream: [], channel: [] }
  const notes: Record<LaneId, string> = { live: '', stream: '', channel: '' }
  let log: SimLog[] = []
  let subs: (() => void)[] = []
  let timers: ReturnType<typeof setTimeout>[] = []
  const emit = () => subs.forEach(s => s())
  const logOf = (who: string, text: string) => { log = [...log, { at: (now() - start) / 1000, who, text }].slice(-40) }
  const name = (cid: 'sse' | 'ws') => (cid === 'ws' ? 'channel' : 'sse')
  const invalid = () => transportError(cfg)
  const wireOf = (cid: 'sse' | 'ws') => (cfg.wire === 'tabs' ? 'BroadcastChannel' : cfg.wire === 'fake' ? 'weft/test fake pair' : cid === 'sse' ? 'SSE · POST /_weft/rt' : 'WebSocket · crossws')
  const blocked = (cid: 'sse' | 'ws') => cfg.wire !== 'tabs' && (cfg.network === 'offline' || (cfg.network === 'wsblock' && cid === 'ws' && cfg.wire === 'default'))
  const note = (cid: 'sse' | 'ws', text: string) => { for (const [k, , c] of LANES) if (c === cid) notes[k] = text }
  const sample = () => {
    if (cfg.wire === 'tabs') return 0.6 + rnd() * 0.8
    let base = cfg.wire === 'fake' ? rnd() * 2 : 20 + rnd() * 40 + BUS_MS[cfg.bus]
    if (cfg.network === 'slow') base *= 6
    if (cfg.network === 'lossy' && rnd() < 0.3) base += rnd() * 400 + (rnd() < 0.12 ? 700 : 0)
    return base
  }
  const later = (fn: () => void, ms: number) => {
    const t: ReturnType<typeof setTimeout> = setTimeout(() => { timers = timers.filter(x => x !== t); fn() }, pace(ms))
    timers.push(t)
    return t
  }
  const push = (k: LaneId, x: number) => { samples[k] = [...samples[k], x].slice(-20) }
  function connect(cid: 'sse' | 'ws', why = '') {
    const c = conns[cid]
    if (invalid()) { c.state = 'offline'; c.retryAt = 0; note(cid, 'Build failed · fix the bus to start'); return }
    if (blocked(cid)) {
      c.state = 'offline'; c.retryAt = 0
      if (cfg.network === 'wsblock') { note(cid, 'WebSocket upgrade blocked · no fallback in v0'); logOf(name(cid), 'upgrade blocked (426), no long-poll fallback') }
      else note(cid, "Browser offline · retries the moment it's back")
      return
    }
    c.state = 'connecting'; c.retryAt = 0; note(cid, why)
    later(() => {
      if (c.state !== 'connecting') return
      if (blocked(cid) || invalid()) { connect(cid); emit(); return }
      const replay = Math.floor(rnd() * 5)
      if (c.behind) {
        c.behind = false; c.epoch++; c.seq = 0
        note(cid, 'Too far behind · reset, refetched')
        logOf(name(cid), `reset: outside the 256-event / 60 s window, epoch → ${c.epoch}`)
      } else if (c.attempt) {
        note(cid, `Resumed from ${c.epoch}:${c.seq} · ${replay} replayed`)
        logOf(name(cid), `resumed from ${c.epoch}:${c.seq}, ${replay} replayed`)
        c.seq += replay
      } else logOf(name(cid), `open over ${wireOf(cid)}`)
      c.state = 'live'; c.attempt = 0
      emit()
    }, cfg.wire === 'tabs' ? 120 : 350 + rnd() * 400)
  }
  function drop(cid: 'sse' | 'ws', reason: string) {
    const c = conns[cid]
    if (c.state === 'offline' && !c.retryAt) return
    c.attempt++
    const cap = backoffCap(c.attempt)
    const wait = rnd() * cap
    c.state = 'reconnecting'
    c.retryAt = now() + wait * 1000
    logOf(name(cid), `${reason}; retry ${c.attempt} in ${wait.toFixed(1)} s (cap ${cap} s)`)
    clearTimeout(c.timer)
    c.timer = later(() => { if (c.state === 'reconnecting') { connect(cid); emit() } }, wait * 1000)
  }
  const restart = (why?: string) => {
    for (const cid of ['sse', 'ws'] as const) { clearTimeout(conns[cid].timer); conns[cid].attempt = 0; connect(cid, why) }
    for (const [k] of LANES) samples[k] = []
  }
  const each = (fn: (cid: 'sse' | 'ws', c: Conn) => void) => { for (const cid of ['sse', 'ws'] as const) fn(cid, conns[cid]) }
  return {
    get config() { return cfg },
    get log() { return log },
    lanes(): Record<LaneId, SimLane> {
      const at = now()
      const lane = ([k, , cid]: (typeof LANES)[number]): SimLane => {
        const c = conns[cid]
        const via = cid === 'sse' && cfg.wire === 'default' ? (k === 'live' ? ' · poke + refetch' : ' · shared') : ''
        return {
          state: c.state, samples: samples[k], wire: wireOf(cid) + via,
          cursor: cfg.wire === 'default' ? `${c.epoch}:${c.seq + (k === 'stream' ? 3 : 0)}` : 'n/a',
          note: c.state === 'reconnecting' && c.retryAt ? `Retry ${c.attempt} in ${Math.max(0, (c.retryAt - at) / 1000).toFixed(1)} s` : notes[k],
        }
      }
      return { live: lane(LANES[0]), stream: lane(LANES[1]), channel: lane(LANES[2]) }
    },
    start() { restart(); emit() },
    configure(next: Partial<TransportConfig>) {
      const was = cfg
      cfg = { ...cfg, ...next }
      if (cfg.bus === 'durable-object' && cfg.preset !== 'cf') { cfg.bus = 'postgres'; logOf('config', 'durable-object needs Cloudflare; bus → postgres') }
      if (next.wire !== undefined && next.wire !== was.wire) logOf('config', `wire → ${cfg.wire}`)
      if (next.bus !== undefined && next.bus !== was.bus) logOf('config', `realtime.bus → ${cfg.bus}`)
      if (next.preset !== undefined && next.preset !== was.preset) logOf('config', `preset → ${cfg.preset}`)
      if (next.network !== undefined && next.network !== was.network) {
        logOf('network', cfg.network)
        each((cid, c) => {
          if (c.state === 'live' && !blocked(cid)) return
          clearTimeout(c.timer)
          if (!blocked(cid) && c.state === 'offline' && !invalid()) c.attempt = Math.max(1, c.attempt)
          connect(cid)
        })
      } else restart()
      emit()
    },
    ping() {
      for (const [k, n, cid] of LANES) {
        if (conns[cid].state !== 'live') { logOf(n, `ping skipped: ${conns[cid].state}`); continue }
        const x = sample()
        push(k, x)
        logOf(n, `ping ${formatMs(x)}`)
      }
      emit()
    },
    /** False when there is nothing to drop (tabs only has no server connection). */
    drop() {
      if (cfg.wire === 'tabs') { logOf('tabs', 'nothing to drop: no server connection'); emit(); return false }
      each((cid, c) => { if (c.state === 'live') drop(cid, 'connection dropped') })
      emit()
      return true
    },
    fallBehind() {
      if (cfg.wire !== 'default') { logOf('config', "cursors only exist on weft's default wires"); emit(); return }
      each((_, c) => { c.behind = true })
      logOf('sim', 'missed > 256 events while away')
      each((cid, c) => { if (c.state === 'live') drop(cid, 'connection dropped after a long sleep') })
      emit()
    },
    reset(next: TransportConfig) { cfg = { ...next }; log = []; logOf('config', 'reset'); restart(); emit() },
    tick() {
      for (const [k, , cid] of LANES) if (conns[cid].state === 'live') push(k, sample())
      each((cid, c) => {
        if (c.state !== 'live') return
        c.seq += Math.floor(rnd() * 3)
        if (cfg.network === 'lossy' && cfg.wire !== 'tabs' && rnd() < 0.1) drop(cid, 'dropped (lossy network)')
      })
      emit()
    },
    subscribe(fn: () => void) { subs.push(fn); return () => { subs = subs.filter(s => s !== fn) } },
    destroy() { timers.forEach(clearTimeout); timers = []; subs = [] },
  }
}

/** Runs `tick` every `ms` while `el` is on screen and the page visible (07 §4.7: no pings for nobody). */
export function whileSeen(el: HTMLElement, opts: { ms: number; tick(): void }) {
  let o = opts
  const doc = el.ownerDocument
  const win = doc.defaultView as (Window & typeof globalThis) | null
  let seen = !win?.IntersectionObserver
  let timer: ReturnType<typeof setInterval> | undefined
  const sync = () => {
    clearInterval(timer)
    timer = undefined
    if (seen && !doc.hidden) timer = setInterval(() => o.tick(), o.ms)
  }
  const io = win?.IntersectionObserver ? new win.IntersectionObserver(es => { for (const e of es) seen = e.isIntersecting; sync() }) : undefined
  io?.observe(el)
  doc.addEventListener('visibilitychange', sync)
  sync()
  return {
    update: (next: typeof opts) => void (o = next),
    destroy() { clearInterval(timer); io?.disconnect(); doc.removeEventListener('visibilitychange', sync) },
  }
}

/** Toolbar and radio-style key handling share nextIndex; this is the toolbar's tab stop (07 §3.4). */
export function toolbar(el: HTMLElement, opts: { items: string }) {
  let o = opts
  const items = () => [...el.querySelectorAll<HTMLElement>(o.items)].filter(n => !n.matches(':disabled'))
  const rove = (t: HTMLElement) => { for (const n of items()) n.tabIndex = n === t ? 0 : -1 }
  const onKey = (e: KeyboardEvent) => {
    const list = items()
    const at = list.indexOf(e.target as HTMLElement)
    if (at < 0) return
    const to = nextIndex(e.key, at, list.length, { rtl: getComputedStyle(el).direction === 'rtl' })
    if (to < 0) return
    e.preventDefault()
    rove(list[to])
    list[to].focus()
  }
  const onFocus = (e: FocusEvent) => { if ((e.target as Element).matches?.(o.items)) rove(e.target as HTMLElement) }
  el.addEventListener('keydown', onKey)
  el.addEventListener('focusin', onFocus)
  return {
    update: (next: typeof opts) => void (o = next),
    destroy() { el.removeEventListener('keydown', onKey); el.removeEventListener('focusin', onFocus) },
  }
}
