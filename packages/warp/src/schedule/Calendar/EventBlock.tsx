import { derived } from '@weft-js/core'
import { dstShift, type DaySegment } from '@weft-js/warp-core'
import { RepeatGlyph, SweepParts, tint } from '../bits'

import type { Ctx } from './calendar-state'
import { hours } from './shared'

/** The event block (07 §2.1): a button with `--_top`, `--_h` and its lane. */
export function EventBlock({
  seg,
  lane,
  c,
  stop,
}: {
  seg: DaySegment
  lane: { col: number; cols: number; span: number }
  c: Ctx
  stop: boolean
}) {
  const e = derived(() => seg.event)
  const len = derived(() => seg.e - seg.s)
  const state_ = derived(() =>
    c.moving.value?.id === seg.id ? 'moving' : c.drag.value?.id === seg.id ? 'dragging' : undefined,
  )
  const shift = derived(() => dstShift(e.value, c.tz()))
  const style = derived(
    () =>
      `${tint(e.value.cal)};--_top:${hours(seg.s)};--_h:${hours(len.value)}${state_.value ? '' : `;--_col:${lane.col};--_cols:${lane.cols};--_span:${lane.span}`}`,
  )
  return (
    <div
      data-part="event"
      data-sweep=""
      data-cal={e.value.cal ?? 1}
      data-id={seg.id}
      role="button"
      tabindex={stop ? '0' : '-1'}
      aria-roledescription="event"
      aria-haspopup="dialog"
      aria-expanded={c.popOpen.value && c.popped.value === seg.id ? 'true' : undefined}
      aria-keyshortcuts="Enter M Delete"
      data-tentative={e.value.tentative ? '' : undefined}
      data-declined={e.value.declined ? '' : undefined}
      data-locked={e.value.locked ? '' : undefined}
      data-short={len.value <= 30 ? '' : undefined}
      data-state={state_.value}
      style={style.value}
    >
      <SweepParts />
      <span class="sr">
        {c.name(e.value)}
        {shift.value ? '. Clocks change during this event; times are wall-clock' : ''}
      </span>
      <span data-part="event-title" aria-hidden="true">
        {e.value.recurrence && <RepeatGlyph />}
        {e.value.recurrence ? ' ' : ''}
        {e.value.title}
      </span>
      <span data-part="event-time" aria-hidden="true">
        {c.span(seg.s, seg.e)}
        {shift.value ? ' · clocks change' : ''}
      </span>
      {len.value >= 90 && e.value.location && (
        <span data-part="event-meta" aria-hidden="true">
          {e.value.location}
        </span>
      )}
      {!e.value.locked && !c.p.readOnly && <span data-part="resize" aria-hidden="true"></span>}
    </div>
  )
}
