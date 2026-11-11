import { derived, onCleanup, onMount, untrack, watch } from '@kerf-js/core'
import {
  calendarDrag,
  dateOf,
  daySegments,
  edges,
  fmt,
  laneKey,
  minuteOf,
  slotTimes,
  uid,
  type DaySegment,
} from '@kerf-js/veneer-core'
import { use } from '@kerf-js/veneer-core/kerf'
import { tint } from '../bits'

import type { Ctx } from './calendar-state'

const STEP = 5 // a timeline lane's column, in minutes

function useTimelineFit({
  c,
  getBox,
  getScroller,
  slots,
  segs,
  rows,
  range,
}: {
  c: Ctx
  getBox: () => HTMLDivElement | undefined
  getScroller: () => HTMLDivElement | undefined
  slots: { value: number }
  segs: { value: unknown }
  rows: { value: unknown }
  range: { value: unknown }
}) {
  // names wrap between words, never inside one: when a word is wider than its booking, every hour widens a step
  // (--_fit) until each word fits, and the rows scroll sideways for it rather than cut a name
  const fit = () => {
    const box = getBox()
    if (!box || untrack(() => c.drag.value || c.moving.value)) return
    const doc = box.ownerDocument
    const titles = () =>
      [...box.querySelectorAll<HTMLElement>('[data-part="lane"] [data-part="event-title"]')].filter(
        (t) => t.offsetWidth,
      )
    const cut = () =>
      titles().some((t) => {
        const r = doc.createRange()
        r.selectNodeContents(t)
        const w = r.getBoundingClientRect(),
          b = t.getBoundingClientRect()
        return w.right > b.right + 0.5 || w.left < b.left - 0.5
      })
    box.style.removeProperty('--_fit')
    const first = box.querySelector<HTMLElement>('[data-part="lane"]')
    if (!first) return
    let hour =
      first.getBoundingClientRect().width /
      Math.max(
        1,
        untrack(() => slots.value),
      )
    for (let i = 0; i < 24 && cut(); i++) box.style.setProperty('--_fit', `${(hour += 8)}px`)
  }
  let frame = 0
  const refit = () => {
    if (typeof requestAnimationFrame === 'undefined') return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(fit)
  }
  watch(() => [segs.value, rows.value, range.value], refit)
  onMount(() => {
    refit()
    void getBox()?.ownerDocument.fonts?.ready.then(refit)
    const scroller = getScroller()
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

function useTimeline(c: Ctx) {
  const hint = uid('tl')
  const range = derived((): [number, number] => c.p.timeline ?? [480, 1080])
  const width = derived(() => range.value[1] - range.value[0])
  const slots = derived(() => Math.round(width.value / 60))
  const marks = derived(() =>
    Array.from({ length: slots.value }, (_, i) => range.value[0] + i * 60),
  )
  const day = derived(() => c.date.value)
  const rows = derived(() => c.p.resources ?? [])
  const segs = derived(() => {
    const pv = c.preview.value
    return daySegments(
      c.visible.value.map((e) =>
        pv?.id === e.id ? { ...e, ...slotTimes(pv), resource: pv.resource } : e,
      ),
      day.value,
    )
  })
  const lane = (id: string) => segs.value.filter((s) => s.event.resource === id)
  const order = derived(() => rows.value.map((r) => lane(r.id).map((s) => ({ id: s.id, s: s.s }))))
  const stop = derived(() => {
    const id = c.stop.value
    return (
      (id && order.value.flat().find((x) => x.id === id)?.id) || order.value.flat()[0]?.id || null
    )
  })
  const nowAt = derived(() => {
    const n = c.now.value
    return n && dateOf(n) === day.value ? minuteOf(n) : null
  })
  let box: HTMLDivElement | undefined
  let scroller: HTMLDivElement | undefined
  use(
    calendarDrag,
    () => box,
    () => ({ ...c.dragOpts(), axis: 'x' as const, from: range.value[0], to: range.value[1] }),
  )
  // an hour keeps a readable width (calendar.css) and the rows scroll sideways under their sticky names: a shadow says so
  use(edges, () => scroller)
  // a lane is a grid of five-minute columns: a booking spans its minutes, and the row grows to hold its whole name
  const cols = derived(() => Math.max(1, Math.round(width.value / STEP)))
  const place = (s: DaySegment) => {
    const [from, to] = range.value
    const a = Math.min(Math.max(s.s, from), to - STEP),
      b = Math.max(Math.min(s.e, to), a + STEP)
    return `grid-column:${Math.round((a - from) / STEP) + 1} / span ${Math.max(1, Math.round((b - a) / STEP))}`
  }
  useTimelineFit({ c, getBox: () => box, getScroller: () => scroller, slots, segs, rows, range })
  const onKey = (e: KeyboardEvent) =>
    c.eventKeys(e, {
      resources: (c.p.resources ?? []).map((r) => r.id),
      next: (k, id) => laneKey(k, id, order.value),
    })
  return {
    hint,
    range,
    width,
    slots,
    marks,
    day,
    rows,
    lane,
    stop,
    nowAt,
    cols,
    place,
    onKey,
    setBox: (n: HTMLDivElement) => (box = n),
    setScroller: (n: HTMLDivElement) => (scroller = n),
  }
}

function TimelineEvent({
  s,
  r,
  c,
  stop,
  place,
}: {
  s: DaySegment
  r: { name: string }
  c: Ctx
  stop: ReturnType<typeof useTimeline>['stop']
  place: ReturnType<typeof useTimeline>['place']
}) {
  return (
    <div
      data-part="event"
      data-cal={s.event.cal ?? 1}
      data-short=""
      data-id={s.id}
      role="gridcell"
      tabindex={stop.value === s.id ? '0' : '-1'}
      data-state={
        c.moving.value?.id === s.id ? 'moving' : c.drag.value?.id === s.id ? 'dragging' : undefined
      }
      style={`${tint(s.event.cal)};${place(s)}`}
    >
      <span class="sr">{`${s.event.title}, ${r.name}, ${c.span(s.s, s.e)}`}</span>
      <span data-part="event-title" aria-hidden="true">
        {s.event.title}
      </span>
      <span data-part="event-time" aria-hidden="true">
        {c.span(s.s, s.e)}
      </span>
      <span data-part="event-start" aria-hidden="true">
        {c.time(s.s)}
      </span>
    </div>
  )
}

/** Timeline (07 §2.5): rows of rooms or people over hours, one roving stop, the same drag on the x axis. */
export function Timeline({ c }: { c: Ctx }) {
  const {
    hint,
    range,
    width,
    slots,
    marks,
    day,
    rows,
    lane,
    stop,
    nowAt,
    cols,
    place,
    onKey,
    setBox,
    setScroller,
  } = useTimeline(untrack(() => c))
  // a booking carries its name, times and start; which show is its own width (calendar.css): its whole name with its
  // times under it, its whole name, or only the start time when it is too narrow for a word
  return (
    <div data-scope="edges" data-part="timeline-edges">
      <div ref={setScroller} data-part="scroller">
        <div
          ref={setBox}
          data-part="timeline"
          role="grid"
          aria-label={`${(c.p.resources ?? []).length ? 'Resources' : 'Timeline'}, ${fmt(day.value, { weekday: 'long', month: 'short', day: 'numeric' }, c.env.locale.value)}`}
          aria-describedby={hint}
          onKeyDown={onKey}
          style={`--_slots:${slots.value}`}
        >
          <span data-part="corner" aria-hidden="true"></span>
          <div
            data-part="marks"
            class="muted"
            aria-hidden="true"
            style={`display:grid;grid-template-columns:repeat(${marks.value.length},1fr)`}
          >
            {marks.value.map((m) => (
              <span key={m}>{c.time(m)}</span>
            ))}
          </div>
          {rows.value.map((r) => (
            <div key={r.id} role="row">
              <div data-part="lane-label" role="rowheader">
                <b>{r.name}</b>
                {r.meta && <span class="muted">{r.meta}</span>}
              </div>
              <div
                data-part="lane"
                data-resource={r.id}
                data-date={day.value}
                style={`--_slots:${slots.value};--_cols:${cols.value}`}
              >
                {lane(r.id).map((s) => (
                  <TimelineEvent key={s.id} s={s} r={r} c={c} stop={stop} place={place} />
                ))}
                {nowAt.value !== null &&
                  nowAt.value >= range.value[0] &&
                  nowAt.value <= range.value[1] && (
                    <span
                      data-part="now"
                      aria-hidden="true"
                      style={`--_top:0;inset-block:0;inset-inline-start:${((nowAt.value - range.value[0]) / width.value) * 100}%;inline-size:0;block-size:auto;border:0;border-inline-start:var(--veneer-border-emphasis) solid var(--veneer-color-sweep)`}
                    ></span>
                  )}
              </div>
            </div>
          ))}
        </div>
        <span class="sr" id={hint}>
          Left and right move along a row, up and down to the nearest booking in the next row. M
          moves a booking.
        </span>
      </div>
    </div>
  )
}
