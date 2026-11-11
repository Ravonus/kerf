// -- notification preferences (07 §4.6) --------------------------------------------------------------------------------

/** Who's on for what: channels by event. */
export type PrefValues = Record<string, Record<string, boolean>>
/** One event people can opt in or out of. */
export interface PrefEvent {
  id: string
  label: string
  hint?: string
  instant?: boolean
}
/** A named group of events. */
export interface PrefGroup {
  id: string
  label: string
  events: PrefEvent[]
}
/** Which channels each event offers, and which are locked on. */
export interface PrefRules {
  offered?: Record<string, string[]> | undefined
  locked?: Record<string, string[]> | undefined
}
/** One toggled cell. */
export interface PrefChange {
  event: string
  channel: string
  on: boolean
}
/** What one cell of the preferences grid shows. */
export type PrefCell = 'on' | 'off' | 'locked' | 'na'
/** What a whole row or column of toggles reads as. */
export type TriState = 'on' | 'off' | 'mixed'

const isOffered = (r: PrefRules, ev: string, ch: string) =>
  !r.offered?.[ev] || r.offered[ev].includes(ch)
const isLocked = (r: PrefRules, ev: string, ch: string) => !!r.locked?.[ev]?.includes(ch)

/** The cell for `event` on `channel`. */
export function prefCell(
  v: PrefValues,
  rules: PrefRules,
  event: string,
  channel: string,
): PrefCell {
  if (isLocked(rules, event, channel)) return 'locked'
  if (!isOffered(rules, event, channel)) return 'na'
  return v[event]?.[channel] ? 'on' : 'off'
}

/** The channels' offered, unlocked cells among `events`: what a group or channel toggle moves. */
export const movable = (events: readonly PrefEvent[], rules: PrefRules, channel: string) =>
  events.filter((e) => isOffered(rules, e.id, channel) && !isLocked(rules, e.id, channel))

/** A parent toggle's state; null when no cell below can move ("not offered"). */
export function triState(
  v: PrefValues,
  events: readonly PrefEvent[],
  rules: PrefRules,
  channel: string,
): TriState | null {
  const cells = movable(events, rules, channel)
  if (!cells.length) return null
  const on = cells.filter((e) => v[e.id]?.[channel]).length
  return on === 0 ? 'off' : on === cells.length ? 'on' : 'mixed'
}

/** The changes a parent toggle makes: mixed goes to all on (the native behaviour). */
export function toggleChanges(
  v: PrefValues,
  events: readonly PrefEvent[],
  rules: PrefRules,
  channel: string,
): PrefChange[] {
  const on = triState(v, events, rules, channel) !== 'on'
  return movable(events, rules, channel).map((e) => ({ event: e.id, channel, on }))
}

/** The preferences with `changes` applied. */
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
  const grid = () =>
    [...el.querySelectorAll<HTMLElement>(o.rows ?? '[role="row"]')].map((r) => [
      ...r.querySelectorAll<HTMLElement>(o.targets),
    ])
  const rove = (t: HTMLElement) => {
    for (const row of grid()) for (const x of row) x.tabIndex = x === t ? 0 : -1
  }
  const onKey = (e: KeyboardEvent) => {
    const g = grid()
    let r = g.findIndex((row) => row.includes(e.target as HTMLElement))
    if (r < 0) return
    let c = g[r]!.indexOf(e.target as HTMLElement)
    const rtl = getComputedStyle(el).direction === 'rtl'
    const ctrl = e.ctrlKey || e.metaKey
    const last = g.length - 1
    const end = g[r]!.length - 1
    if (e.key === 'ArrowRight') c += rtl ? -1 : 1
    else if (e.key === 'ArrowLeft') c += rtl ? 1 : -1
    else if (e.key === 'ArrowDown') r++
    else if (e.key === 'ArrowUp') r--
    else if (e.key === 'Home') {
      c = 0
      if (ctrl) r = 0
    } else if (e.key === 'End') {
      c = end
      if (ctrl) r = last
    } else return
    e.preventDefault()
    r = Math.max(0, Math.min(last, r))
    c = Math.max(0, Math.min(end, c))
    const t = g[r]![c]!
    rove(t)
    t.focus()
  }
  const onFocus = (e: FocusEvent) => {
    if ((e.target as Element).matches?.(o.targets)) rove(e.target as HTMLElement)
  }
  el.addEventListener('keydown', onKey)
  el.addEventListener('focusin', onFocus)
  return {
    update: (next: typeof opts) => void (o = next),
    destroy() {
      el.removeEventListener('keydown', onKey)
      el.removeEventListener('focusin', onFocus)
    },
  }
}
