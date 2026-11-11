import type { Slot, CalEvent } from './dates'
import { clamp, addDays } from '../temporal'
import { DAY, dateOf, minuteOf } from './dates'

// -- snapping, drags, keyboard moves ----------------------------------------------------------------------------------

/** `m` to the nearest `step`. */
export const snapTo = (m: number, step = 15) => Math.round(m / step) * step

/** A slot moved by `dm` minutes onto `date`, snapped, keeping its length. */
export function dragMove(
  origin: Slot,
  dm: number,
  date: string,
  step = 15,
  resource?: string,
): Slot {
  const len = origin.e - origin.s
  const s = clamp(snapTo(origin.s + dm, step), 0, DAY - Math.min(len, DAY))
  return { date, s, e: s + len, resource: resource ?? origin.resource }
}

/** A slot with its end moved by `dm` minutes, snapped, never shorter than a step. */
export function dragResize(origin: Slot, dm: number, step = 15): Slot {
  return { ...origin, e: clamp(snapTo(origin.e + dm, step), origin.s + step, DAY) }
}

/** A drag on empty slots, either way from where it began. */
export function dragCreate(date: string, anchor: number, current: number, step = 15): Slot {
  const a = snapTo(anchor, step),
    c = snapTo(current, step)
  const s = clamp(Math.min(a, c), 0, DAY - step)
  return { date, s, e: clamp(Math.max(a + (c >= a ? 0 : step), c), s + step, DAY) }
}

/** What a key does during a keyboard move: drop, cancel, a new slot, or nothing. */
export type MoveKey = 'drop' | 'cancel' | Slot | null

/**
 * Keyboard move mode (07 §2.2): ↑↓ by `step`, ←→ by a day within `days`, Shift+↑↓ resizes, Enter drops, Escape cancels.
 * On a timeline (`resources`) ←→ move along the lane and ↑↓ between rows.
 */
export function moveKey(
  key: string,
  shift: boolean,
  slot: Slot,
  opts: {
    step?: number
    days?: string[] | undefined
    rtl?: boolean
    resources?: string[] | undefined
  } = {},
): MoveKey {
  const { step = 15, days, rtl, resources } = opts
  const len = slot.e - slot.s
  const by = (d: number): Slot => {
    const s = clamp(slot.s + d, 0, DAY - len)
    return { ...slot, s, e: s + len }
  }
  if (key === 'Enter') return 'drop'
  if (key === 'Escape') return 'cancel'
  const dir = key === 'ArrowRight' ? (rtl ? -1 : 1) : key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0
  const down = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
  if (resources) {
    if (dir) return by(dir * step)
    if (!down) return null
    const r = resources[resources.indexOf(slot.resource ?? '') + down]
    return r ? { ...slot, resource: r } : slot
  }
  if (down) return shift ? dragResize(slot, down * step, step) : by(down * step)
  if (!dir) return null
  const to = addDays(slot.date, dir)
  return !days || days.includes(to) ? { ...slot, date: to } : slot
}

/** Roving keys over events: ↑↓ through time, ←→ to the nearest event of the next day with one. */
export function eventKey(key: string, id: string, events: CalEvent[], rtl = false) {
  const order = [...events].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  const i = order.findIndex((e) => e.id === id)
  if (i < 0) return null
  if (key === 'ArrowDown') return order[i + 1]?.id ?? null
  if (key === 'ArrowUp') return order[i - 1]?.id ?? null
  if (key === 'Home') return order[0]!.id
  if (key === 'End') return order[order.length - 1]!.id
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
  const forward = (key === 'ArrowRight') !== rtl
  const day = dateOf(order[i]!.start),
    m = minuteOf(order[i]!.start)
  const days = [...new Set(order.map((e) => dateOf(e.start)))].filter((d) =>
    forward ? d > day : d < day,
  )
  const to = forward ? days[0] : days[days.length - 1]
  if (!to) return null
  return order
    .filter((e) => dateOf(e.start) === to)
    .sort((a, b) => Math.abs(minuteOf(a.start) - m) - Math.abs(minuteOf(b.start) - m))[0]!.id
}

/** ←→ along a lane, ↑↓ to the nearest booking in the next row (07 §2.5). */
export function laneKey(key: string, id: string, rows: { id: string; s: number }[][]) {
  const r = rows.findIndex((l) => l.some((x) => x.id === id))
  if (r < 0) return null
  const lane = rows[r]!,
    i = lane.findIndex((x) => x.id === id)
  if (key === 'ArrowRight') return lane[i + 1]?.id ?? null
  if (key === 'ArrowLeft') return lane[i - 1]?.id ?? null
  if (key === 'Home') return lane[0]!.id
  if (key === 'End') return lane[lane.length - 1]!.id
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null
  const d = key === 'ArrowDown' ? 1 : -1
  for (let n = r + d; n >= 0 && n < rows.length; n += d)
    if (rows[n]!.length)
      return [...rows[n]!].sort(
        (a, b) => Math.abs(a.s - lane[i]!.s) - Math.abs(b.s - lane[i]!.s),
      )[0]!.id
  return null
}
