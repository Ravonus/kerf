import type { CalEvent, Slot, DaySegment, Lane, Range } from './dates'
import { slotTimes, minuteOf, spanMinutes, DAY, dateOf } from './dates'
import { addDays, daysBetween } from '../temporal'

// -- ranges, overlap, layout ------------------------------------------------------------------------------------------

/** Whether two timed events overlap. */
export const overlaps = (a: CalEvent, b: CalEvent) =>
  a.id !== b.id && !a.allDay && !b.allDay && a.start < b.end && b.start < a.end

/** The events that collide with `e` at `slot` (or where it is). */
export function conflicts(events: CalEvent[], e: CalEvent, slot?: Slot) {
  const at_ = slot ? { ...e, ...slotTimes(slot) } : e
  return events.filter((x) => overlaps(x, at_) && (!slot?.resource || x.resource === slot.resource))
}

/** Timed events on one day, clipped to it. */
export function daySegments(events: CalEvent[], day: string): DaySegment[] {
  const open = `${day}T00:00`,
    close = `${addDays(day, 1)}T00:00`
  const out: DaySegment[] = []
  for (const event of events) {
    if (event.allDay || event.start >= close || event.end <= open) continue
    const head = event.start >= open,
      tail = event.end <= close
    out.push({
      event,
      id: event.id,
      s: head ? minuteOf(event.start) : 0,
      e: tail ? spanMinutes(open, event.end) : DAY,
      head,
      tail,
    })
  }
  return out.sort((a, b) => a.s - b.s || b.e - a.e)
}

/**
 * Lanes (07 §2.2): within a cluster of overlapping events each takes the leftmost free lane, then spans right across
 * every lane that stays free beside it, so a long block is never squeezed by a short call.
 */
export function layoutDay<T extends { id: string; s: number; e: number }>(list: T[]) {
  const sorted = [...list].sort((a, b) => a.s - b.s || b.e - a.e)
  const out = new Map<string, Lane>()
  let cluster: T[] = [],
    end = -1
  const flush = () => {
    const lanes: number[] = []
    for (const x of cluster) {
      let c = lanes.findIndex((free) => free <= x.s)
      if (c < 0) {
        c = lanes.length
        lanes.push(0)
      }
      lanes[c] = x.e
      out.set(x.id, { col: c, cols: 0, span: 1 })
    }
    for (const x of cluster) {
      const o = out.get(x.id)!
      o.cols = lanes.length
      for (let c = o.col + 1; c < lanes.length; c++) {
        if (cluster.some((y) => out.get(y.id)!.col === c && y.s < x.e && y.e > x.s)) break
        o.span++
      }
    }
    cluster = []
  }
  for (const x of sorted) {
    if (x.s >= end && cluster.length) flush()
    cluster.push(x)
    end = Math.max(end, x.e)
  }
  if (cluster.length) flush()
  return out
}

/** All-day bars over `days`: first column, span, and the row each lands on. */
export function allDayBars(events: CalEvent[], days: string[]) {
  const rows: number[] = []
  const bars: { event: CalEvent; id: string; col: number; span: number; row: number }[] = []
  const first = days[0]!,
    last = days[days.length - 1]!
  const list = events
    .filter((e) => e.allDay && dateOf(e.start) <= last && dateOf(e.end) >= first)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end > b.end ? -1 : 1))
  for (const event of list) {
    const col = Math.max(0, daysBetween(first, dateOf(event.start)))
    const end = Math.min(days.length - 1, daysBetween(first, dateOf(event.end)))
    let row = rows.findIndex((free) => free <= col)
    if (row < 0) {
      row = rows.length
      rows.push(0)
    }
    rows[row] = end + 1
    bars.push({ event, id: event.id, col, span: end - col + 1, row })
  }
  return bars
}

/** Everything on a day: all-day events first, then by time. */
export function eventsOn(events: CalEvent[], day: string) {
  const all = events.filter((e) => e.allDay && dateOf(e.start) <= day && dateOf(e.end) >= day)
  return [...all, ...daySegments(events, day).map((s) => s.event)]
}

/** Merge touching and overlapping ranges. */
export function mergeRanges(list: Range[]) {
  const out: Range[] = []
  for (const [s, e] of [...list].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}
