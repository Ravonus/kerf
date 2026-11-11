import { derived, onCleanup, onMount, untrack, watch } from '@kerf-js/core'
import {
  allDayBars,
  calendarDrag,
  dateOf,
  daySegments,
  dow,
  edges,
  eventKey,
  fmt,
  isWeekend,
  layoutDay,
  minuteOf,
  viewDays,
  ymd,
} from '@kerf-js/veneer-core'
import { use } from '@kerf-js/veneer-core/kerf'
import { tint } from '../bits'

import type { Ctx } from './calendar-state'
import { Column } from './Column'
import { hours } from './shared'
import { fitTimeGrid } from './time-fit'

function useTimeData(c: Ctx, count: number) {
  const days = derived(() => viewDays(c.view.value, c.date.value, c.first.value, count) as string[])
  const list = derived(() =>
    c.visible.value.filter((e) =>
      days.value.some((d) => dateOf(e.start) <= d && dateOf(e.end) >= d),
    ),
  )
  const stop = derived(() => {
    const id = c.stop.value
    return (
      (id && list.value.find((e) => e.id === id)?.id) ||
      [...list.value].sort((a, b) => (a.start < b.start ? -1 : 1))[0]?.id ||
      null
    )
  })
  const bars = derived(() => allDayBars(c.visible.value, days.value))
  const nowAt = derived(() => {
    const n = c.now.value
    return n && days.value.includes(dateOf(n)) ? minuteOf(n) : null
  })
  // a day's least width grows by half for each event that runs beside another (up to four), so side-by-side events
  // still read; past the box's width the week scrolls sideways (calendar.css)
  const widths = derived(() =>
    days.value.map((d) => {
      const lanes = Math.max(
        1,
        ...[...layoutDay(daySegments(c.visible.value, d)).values()].map((l) => l.cols),
      )
      return 1 + (Math.min(lanes, 4) - 1) / 2
    }),
  )
  const tracks = derived(
    () =>
      `--_tracks:var(--veneer-cal-gutter) ${widths.value.map((f) => `minmax(calc(var(--veneer-cal-day-min) * ${f}), 1fr)`).join(' ')};--_week-w:calc(var(--veneer-cal-gutter) + var(--veneer-cal-day-min) * ${widths.value.reduce((x, y) => x + y, 0)})`,
  )
  return { days, list, stop, bars, nowAt, widths, tracks }
}

function useTimeFit({
  c,
  getScroller,
  getCols,
  days,
  widths,
}: {
  c: Ctx
  getScroller: () => HTMLDivElement | undefined
  getCols: () => HTMLDivElement | undefined
} & Pick<ReturnType<typeof useTimeData>, 'days' | 'widths'>) {
  const fit = () => fitTimeGrid(c, getScroller(), getCols(), widths)
  let frame = 0
  const refit = () => {
    if (typeof requestAnimationFrame === 'undefined') return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(fit)
  }
  // Day and Week share this grid: a fit for one day's tracks would lay a week out in one column until the next frame
  let shownDays = 0
  watch(
    () => [c.visible.value, days.value] as const,
    ([, d]) => {
      const scroller = getScroller()
      if (d.length !== shownDays && scroller)
        for (const v of ['--_tracks', '--_week-w']) scroller.style.removeProperty(v)
      shownDays = d.length
      refit()
    },
  )
  onMount(() => {
    refit()
    const scroller = getScroller()
    void scroller?.ownerDocument.fonts?.ready.then(refit)
    if (typeof ResizeObserver === 'undefined' || !scroller) return
    let w = 0
    const ro = new ResizeObserver((r) => {
      const n = Math.round(r[0]!.contentRect.width)
      if (n !== w) {
        w = n
        refit()
      }
    })
    ro.observe(scroller)
    onCleanup(() => {
      ro.disconnect()
      cancelAnimationFrame(frame)
    })
  })
}

function useTimeGrid(c: Ctx, count: number) {
  const { days, list, stop, bars, nowAt, widths, tracks } = useTimeData(c, count)
  let cols: HTMLDivElement | undefined
  let scroller: HTMLDivElement | undefined
  use(
    calendarDrag,
    () => cols,
    () => c.dragOpts(),
  )
  use(edges, () => scroller) // a week wider than its box shades the side with more, past the hours
  // open half an hour before the working day, and sideways at the shown date when the week is wider than its box. The root
  // bounds its own height (calendar.css), so this scrolls even when no parent gives the calendar a height
  onMount(() => {
    if (!scroller || !cols) return
    scroller.scrollTop =
      (cols.offsetHeight / 1440) * Math.max(0, (c.p.workingHours ?? [480, 1080])[0] - 30)
    const col = cols.querySelector<HTMLElement>(
      `[data-part="col"][data-date="${untrack(() => c.date.value)}"]`,
    )
    const gutter = cols.querySelector<HTMLElement>('[data-part="gutter"]')?.offsetWidth ?? 0
    if (col && scroller.scrollWidth > scroller.clientWidth)
      scroller.scrollLeft = Math.max(0, col.offsetLeft - gutter)
  })
  useTimeFit({ c, getScroller: () => scroller, getCols: () => cols, days, widths })
  const onKey = (e: KeyboardEvent) =>
    c.eventKeys(e, {
      days: days.value,
      next: (k, id) =>
        eventKey(k, id, list.value, getComputedStyle(e.target as Element).direction === 'rtl'),
    })
  const onChip = (e: MouseEvent) => {
    const el = (e.target as Element).closest?.<HTMLElement>('[data-id]')
    if (el) c.openPopover(el.dataset.id!, el)
  }
  return {
    days,
    stop,
    bars,
    nowAt,
    tracks,
    onKey,
    onChip,
    setScroller: (n: HTMLDivElement) => (scroller = n),
    setCols: (n: HTMLDivElement) => (cols = n),
  }
}

function TimeDayHead({ d, c }: { d: string; c: Ctx }) {
  return (
    <div
      data-part="dayhead"
      role="columnheader"
      aria-label={fmt(d, { weekday: 'long', month: 'short', day: 'numeric' }, c.env.locale.value)}
      aria-current={d === c.env.today.value ? 'date' : undefined}
    >
      <span>{fmt(d, { weekday: 'short' }, c.env.locale.value)}</span>
      <b>{ymd(d)[2]}</b>
    </div>
  )
}

/** Week and Day (07 §2.5): an APG grid, day columns as columnheaders, events inside gridcells. */
export function TimeGrid({ c, count }: { c: Ctx; count: number }) {
  const { days, stop, bars, nowAt, tracks, onKey, onChip, setScroller, setCols } = useTimeGrid(
    untrack(() => c),
    untrack(() => count),
  )
  return (
    <div
      data-scope="edges"
      data-part="grid"
      data-view="time"
      role="grid"
      aria-label={fmt(days.value[0]!, { month: 'long', year: 'numeric' }, c.env.locale.value)}
      style={`--_days:${days.value.length};--veneer-edges-start:var(--veneer-cal-gutter);${tracks.value}`}
      onKeyDown={onKey}
    >
      <div ref={setScroller} data-part="scroller">
        <div data-part="top">
          <div data-part="head" role="row">
            <span data-part="corner" aria-hidden="true"></span>
            {days.value.map((d) => (
              <TimeDayHead key={d} d={d} c={c} />
            ))}
          </div>
          <div data-part="allday" role="row" onClick={onChip}>
            <span data-part="gutter-label" role="rowheader">
              All day
            </span>
            {days.value.map((d, i) => (
              <div
                key={d}
                data-part="allday-cell"
                style={`grid-column:${i + 2};grid-row:1 / span ${Math.max(1, ...bars.value.map((b) => b.row + 1))}`}
              ></div>
            ))}
            {bars.value.map((b) => (
              <div
                key={b.id}
                data-part="chip"
                data-cal={b.event.cal ?? 1}
                data-id={b.id}
                role="gridcell"
                tabindex={stop.value === b.id ? '0' : '-1'}
                aria-label={c.name(b.event)}
                style={`${tint(b.event.cal)};grid-column:${b.col + 2} / span ${b.span};grid-row:${b.row + 1}`}
              >
                {b.event.title}
              </div>
            ))}
          </div>
        </div>
        <div ref={setCols} data-part="cols" role="row">
          <div data-part="gutter" aria-hidden="true">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span key={h} data-part="hour" style={`top:${hours(h * 60)}`}>
                {c.time(h * 60)}
              </span>
            ))}
            {nowAt.value !== null && (
              <span data-part="now-label" style={`--_top:${hours(nowAt.value)}`}>
                {c.time(nowAt.value)}
              </span>
            )}
          </div>
          {days.value.map((d) => (
            <Column
              key={d}
              day={d}
              c={c}
              stop={stop.value}
              weekend={isWeekend(dow(d), c.env.locale.value)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
