// -- arrivals (07 §0): shared by every list that receives things the user didn't ask for -------------------------------

/** The ids in `next` that `seen` doesn't hold, in order; adds them to `seen`. A first render passes its ids to the Set. */
export function freshIds(seen: Set<string>, next: Iterable<string>) {
  const fresh: string[] = []
  for (const id of next)
    if (!seen.has(id)) {
      seen.add(id)
      fresh.push(id)
    }
  return fresh
}

/** Options for arrivals: how new rows join a list without moving what's being read. */
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
  const rendered = () =>
    rows()
      .map((r) => r.dataset.id!)
      .filter(Boolean)
  const seen = new Set<string>([...rendered(), ...(o.ids ?? [])])
  const pending = new Set<string>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const fire = (ids: string[]) => {
    if (ids.length) o.onArrive?.(ids)
  }
  const mark = () => {
    const nodes = rows()
    const take = o.ids
      ? nodes.filter((r) => pending.has(r.dataset.id!))
      : nodes.filter((r) => !seen.has(r.dataset.id!))
    for (const r of take) {
      seen.add(r.dataset.id!)
      pending.delete(r.dataset.id!)
      r.setAttribute('data-arrive', '')
      const t = setTimeout(() => {
        timers.delete(t)
        r.removeAttribute('data-arrive')
      }, o.hold ?? 2400)
      timers.add(t)
    }
    if (!o.ids) fire(take.map((r) => r.dataset.id!))
  }
  const observer = new win.MutationObserver(mark)
  observer.observe(el, { childList: true, subtree: true })
  return {
    update(next: ArrivalOptions = {}) {
      o = next
      if (!o.ids) return
      const fresh = freshIds(seen, o.ids)
      fresh.forEach((id) => pending.add(id))
      fire(fresh)
      mark()
      // an arrival filtered out of view stays out: it was known by the time it shows
      if (fresh.length)
        timers.add(
          setTimeout(() => {
            mark()
            pending.clear()
          }, 0),
        )
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

/** The inbox's tabs. */
export type InboxTab = 'all' | 'unread' | 'mentions'
/** The least an inbox item needs. */
export interface NoteLike {
  id: string
  read?: boolean | undefined
  kind?: string | undefined
  day?: string | undefined
}

/** The items on one inbox tab. */
export const filterNotes = <T extends NoteLike>(items: readonly T[], tab: InboxTab) =>
  items.filter((n) => tab === 'all' || (tab === 'unread' ? !n.read : n.kind === 'mention'))

/** How many items are unread. */
export const unreadCount = (items: readonly NoteLike[]) => items.filter((n) => !n.read).length

/** Items by their `day` label, in order of first appearance (a list is newest first). */
export function groupByDay<T extends { day?: string | undefined }>(
  items: readonly T[],
  fallback = 'Today',
) {
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
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(at(iso))
}

/** The bell's name and badge text. */
export const bellLabel = (count: number) =>
  count ? `Notifications, ${count} unread` : 'Notifications'
/** A bell's badge text. */
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
    const at = rows.findIndex((r) => r === e.target || r.contains(e.target as Node))
    if (at < 0) return
    const step =
      e.key === 'PageDown' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'PageUp' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (step) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target !== rows[at]) return
      e.preventDefault()
      rows[at + step]?.focus()
      return
    }
    if (e.ctrlKey && (e.key === 'Home' || e.key === 'End')) {
      const all = [
        ...doc.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ),
      ]
      const outside = all.filter((n) => !el.contains(n))
      const beyond =
        e.key === 'Home'
          ? outside.filter((n) => n.compareDocumentPosition(el) & 4).at(-1)
          : outside.find((n) => n.compareDocumentPosition(el) & 2)
      if (beyond) {
        e.preventDefault()
        beyond.focus()
      }
    }
  }
  el.addEventListener('keydown', onKey)
  return {
    update: (next: typeof opts) => void (o = next),
    destroy: () => el.removeEventListener('keydown', onKey),
  }
}

/**
 * Calls `onRead(id)` for a row that has stayed visible in the scroller for `hold` ms (07 §4.2: 2 s visible in the
 * inbox), while `active`. Rows are found afresh: a keyed list inserts them under it. Without IntersectionObserver
 * (a server, an old test environment) it does nothing: reading stays explicit.
 */
export function readOnView(
  el: HTMLElement,
  opts: { items: string; active?: boolean; hold?: number; onRead(id: string): void },
) {
  let o = opts
  const win = el.ownerDocument.defaultView
  if (!win?.IntersectionObserver) return { update: (n: typeof opts) => void (o = n), destroy() {} }
  const timers = new Map<Element, ReturnType<typeof setTimeout>>()
  const stop = (row: Element) => {
    clearTimeout(timers.get(row))
    timers.delete(row)
  }
  const io = new win.IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const row = e.target as HTMLElement
        if (!e.isIntersecting || !o.active || row.hasAttribute('data-read')) {
          stop(row)
          continue
        }
        if (!timers.has(row))
          timers.set(
            row,
            setTimeout(() => {
              timers.delete(row)
              o.onRead(row.dataset.id!)
            }, o.hold ?? 2000),
          )
      }
    },
    { root: el, threshold: 0.6 },
  )
  const watchRows = () => {
    for (const r of el.querySelectorAll(o.items)) io.observe(r)
  }
  const mo = new win.MutationObserver(watchRows)
  mo.observe(el, { childList: true, subtree: true })
  watchRows()
  const clear = () => {
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
  }
  return {
    update(next: typeof opts) {
      const was = o.active
      o = next
      if (o.active === was) return
      clear()
      if (o.active) {
        io.disconnect()
        watchRows()
      }
    },
    destroy() {
      io.disconnect()
      mo.disconnect()
      clear()
    },
  }
}

/** One arrival to notify about. */
export interface NotifyItem {
  id?: string | undefined
  title: string
  description?: string | undefined
  tone?: 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info' | undefined
  urgent?: boolean
  action?: { label: string; onClick(): void } | undefined
}
/** What the notify policy calls, and its limits. */
export interface NotifyPolicyOptions {
  /** Is the inbox on screen? Then nothing toasts and arrivals are only announced. */
  open(): boolean
  show(t: NotifyItem & { id?: string | undefined }): string
  dismiss(id: string): void
  announce(text: string, assertive?: boolean): void
  /** How many arrivals inside `quiet` make a burst. */
  burst?: number
  /** A burst ends after this long with no arrival; it is also the announcement's collapse window (07 §0). */
  quiet?: number | undefined
  /** At most this many toasts from this policy are up at once. */
  max?: number | undefined
  /** "3 new notifications". */
  summary?: (n: number) => string
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
  let run: { n: number; texts: string[]; ids: string[]; collapsed?: string } = {
    n: 0,
    texts: [],
    ids: [],
  }
  let up: string[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  const settle = () => {
    timer = undefined
    if (o.open() && run.n)
      o.announce(run.n === 1 ? `New notification: ${run.texts[0]}` : summary(run.n))
    run = { n: 0, texts: [], ids: [] }
  }
  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      settle()
    }
  }
  return {
    push(item: NotifyItem) {
      clearTimeout(timer)
      timer = setTimeout(settle, quiet)
      if (o.open()) {
        if (item.urgent) o.announce(item.title, true)
        else {
          run.n++
          run.texts.push(item.title)
        }
        return
      }
      run.n++
      if (run.n >= burst) {
        for (const id of run.ids) {
          o.dismiss(id)
          up = up.filter((x) => x !== id)
        }
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
    destroy() {
      clearTimeout(timer)
      timer = undefined
    },
  }
}
