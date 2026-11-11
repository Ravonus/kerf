import { derived, untrack } from '@kerf/core'
import {
  dateOf,
  daySegments,
  fmt,
  layoutDay,
  longDuration,
  minuteOf,
  slotTimes,
} from '@kerf/veneer-core'

import type { Ctx } from './calendar-state'
import { EventBlock } from './EventBlock'
import { nowSpans } from './now-spans'
import { hours } from './shared'

function useColumn(day: string, c: Ctx) {
  const hrs = derived(() => c.p.workingHours ?? [480, 1080])
  const segs = derived(() => {
    const v = c.preview.value
    return daySegments(
      c.visible.value.map((e) => (v?.id === e.id && !e.allDay ? { ...e, ...slotTimes(v) } : e)),
      day,
    )
  })
  const lanes = derived(() => layoutDay(segs.value.filter((s) => s.id !== c.preview.value?.id)))
  const today = derived(() => day === c.env.today.value)
  const nowAt = derived(() => {
    const n = c.now.value
    return n && dateOf(n) === day ? minuteOf(n) : null
  })
  const nowRuns = derived(() =>
    nowSpans(
      nowAt.value,
      segs.value.filter((s) => s.id !== c.preview.value?.id),
      lanes.value,
    ),
  )
  const ghost = derived(() => {
    const v = c.drag.value
    return v?.origin && v.origin.date === day ? v.origin : null
  })
  const draft = derived(() => {
    const v = c.drag.value
    return v?.mode === 'create' && v.date === day ? v : null
  })
  const read = derived(() => {
    const v = c.preview.value
    if (!v || v.date !== day) return null
    return {
      top: hours(v.s),
      text:
        v.mode === 'resize'
          ? `${c.span(v.s, v.e)} · ${longDuration(v.e - v.s)}`
          : `${fmt(v.date, { weekday: 'short' }, c.env.locale.value)} ${c.span(v.s, v.e)}`,
    }
  })
  return { hrs, segs, lanes, today, nowAt, nowRuns, ghost, draft, read }
}

export function Column({
  day,
  c,
  stop,
  weekend,
}: {
  day: string
  c: Ctx
  stop: string | null
  weekend: boolean
}) {
  const { hrs, segs, lanes, today, nowAt, nowRuns, ghost, draft, read } = useColumn(
    untrack(() => day),
    untrack(() => c),
  )
  return (
    <div
      data-part="col"
      role="gridcell"
      data-date={day}
      data-weekend={weekend ? '' : undefined}
      aria-current={today.value ? 'date' : undefined}
    >
      <span data-part="off-hours" style={`--_top:0px;--_h:${hours(hrs.value[0]!)}`}></span>
      <span
        data-part="off-hours"
        style={`--_top:${hours(hrs.value[1]!)};--_h:${hours(1440 - hrs.value[1]!)}`}
      ></span>
      {ghost.value && (
        <span
          data-part="ghost"
          style={`--_top:${hours(ghost.value.s)};--_h:${hours(ghost.value.e - ghost.value.s)}`}
        ></span>
      )}
      {segs.value.map((s) => (
        <EventBlock
          key={s.id}
          seg={s}
          lane={lanes.value.get(s.id) ?? { col: 0, cols: 1, span: 1 }}
          c={c}
          stop={stop === s.id}
        />
      ))}
      {draft.value && (
        <span
          data-part="draft"
          style={`--_top:${hours(draft.value.s)};--_h:${hours(draft.value.e - draft.value.s)}`}
        >
          New event · {c.span(draft.value.s, draft.value.e)}
        </span>
      )}
      {read.value && (
        <span data-part="readout" role="status" style={`inset-block-start:${read.value.top}`}>
          {read.value.text}
        </span>
      )}
      {nowAt.value !== null &&
        nowRuns.value.map((r) => (
          <span
            key={`${r.a}-${r.b}`}
            data-part="now"
            data-cut={r.a > 0 ? '' : undefined}
            style={`--_top:${hours(nowAt.value!)};${r.inset}`}
            aria-hidden="true"
          ></span>
        ))}
    </div>
  )
}
