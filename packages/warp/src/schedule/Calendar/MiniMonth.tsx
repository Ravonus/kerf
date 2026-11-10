import { derived, flush, state, untrack, watch } from '@weft-js/core'
import {
  dayState,
  fmt,
  gridKey,
  monthWeeks,
  stepDate,
  uid,
  viewDays,
  weekdays,
  ymd,
  type IsoDate,
} from '@weft-js/warp-core'
import { LeftIcon, RightIcon } from '@weft-js/warp-icons'
import { Button } from '../../Button'

import type { Ctx } from './calendar-state'

function useMiniMonth(c: Ctx) {
  const id = uid('mini')
  const cursor = state(untrack(() => c.date.value))
  const picked = state(untrack(() => c.date.value))
  const note = state('')
  watch(
    () => c.date.value,
    (d) => {
      cursor.value = d
      picked.value = d
    },
  )
  const weeks = derived(() =>
    monthWeeks(cursor.value, c.first.value).map((days, r) => ({
      key: `${cursor.value.slice(0, 7)}-${r}`,
      days: days.map((iso, k) => ({ iso, k: iso ?? `${cursor.value.slice(0, 7)}-${r}-${k}` })),
    })),
  )
  const heads = derived(() => weekdays(c.first.value, c.env.locale.value))
  const inWeek = (iso: string) =>
    viewDays('week', c.date.value, c.first.value).includes(iso as IsoDate)
  let grid: HTMLDivElement | undefined
  const pick = (iso: string) => {
    picked.value = iso
    if (inWeek(iso)) {
      note.value = ''
      c.date.set(iso)
      c.view.set('day')
      c.say(`Day view, ${fmt(iso, { dateStyle: 'full' }, c.env.locale.value)}`)
    } else {
      c.date.set(iso)
      note.value = `Moved to ${fmt(iso, { month: 'short', day: 'numeric' }, c.env.locale.value)}.`
    }
  }
  const onKey = (e: KeyboardEvent) => {
    const to = gridKey(
      e.key,
      e.shiftKey,
      cursor.value,
      c.first.value,
      getComputedStyle(e.currentTarget as Element).direction === 'rtl',
    )
    if (!to) return
    e.preventDefault()
    if (to === 'pick') return pick(cursor.value)
    cursor.value = to
    flush()
    grid?.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus()
  }
  const onClick = (e: MouseEvent) => {
    const d = (e.target as Element).closest?.<HTMLElement>('[data-day]')?.dataset.day
    if (d) {
      cursor.value = d
      pick(d)
    }
  }
  const name = (iso: string) =>
    `${dayState(iso as IsoDate, { mode: 'single', value: null, today: c.env.today.value, locale: c.env.locale.value }).name}${inWeek(iso) ? ', in the shown week' : ''}`
  return {
    id,
    cursor,
    picked,
    note,
    weeks,
    heads,
    inWeek,
    onClick,
    onKey,
    name,
    bindGrid: (n: HTMLDivElement) => (grid = n),
  }
}

/** The rail's navigator (07 §2.5): an APG date grid, one stop on the focused day. Enter or a press moves the main view. */
export function MiniMonth({ c }: { c: Ctx }) {
  const { id, cursor, picked, note, weeks, heads, inWeek, onClick, onKey, name, bindGrid } =
    useMiniMonth(untrack(() => c))
  return (
    <>
      <div class="row">
        <b id={`${id}-t`} aria-live="polite">
          {fmt(cursor.value, { month: 'long', year: 'numeric' }, c.env.locale.value)}
        </b>
        <span style="flex:1"></span>
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          icon={LeftIcon}
          label="Previous month"
          direction="back"
          onClick={() => (cursor.value = stepDate('month', cursor.value, -1))}
        />
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          icon={RightIcon}
          label="Next month"
          onClick={() => (cursor.value = stepDate('month', cursor.value, 1))}
        />
      </div>
      <div
        ref={bindGrid}
        data-part="mini"
        role="grid"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-h`}
        onKeyDown={onKey}
        onClick={onClick}
      >
        <div role="row">
          {heads.value.map((h) => (
            <span key={h[0]} role="columnheader">
              <span aria-hidden="true">{h[0][0]}</span>
              <span class="sr">{h[0]}</span>
            </span>
          ))}
        </div>
        {weeks.value.map((w) => (
          <div key={w.key} role="row">
            {w.days.map((d) =>
              d.iso ? (
                <span
                  key={d.k}
                  role="gridcell"
                  data-day={d.iso}
                  tabindex={d.iso === cursor.value ? '0' : '-1'}
                  aria-selected={d.iso === picked.value ? 'true' : 'false'}
                  aria-current={d.iso === c.env.today.value ? 'date' : undefined}
                  data-in-range={inWeek(d.iso) ? '' : undefined}
                  aria-label={name(d.iso)}
                >
                  {ymd(d.iso)[2]}
                </span>
              ) : (
                <span key={d.k} role="gridcell" data-outside=""></span>
              ),
            )}
          </div>
        ))}
      </div>
      <span class="sr" id={`${id}-h`}>
        Arrow keys move by day and week, Page Up and Page Down by month, Enter opens the day.
      </span>
      <p data-part="mini-note" aria-live="polite">
        {note.value}
      </p>
    </>
  )
}
