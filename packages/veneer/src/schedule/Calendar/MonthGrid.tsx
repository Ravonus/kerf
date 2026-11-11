import { derived, flush, onCleanup, onMount, state, untrack, watch } from '@kerf-js/core'
import {
  dateOf,
  eventsOn,
  fmt,
  gridKey,
  monthCells,
  monthStart,
  popover,
  uid,
  weekdays,
  ymd,
  type CalEvent,
} from '@kerf-js/veneer-core'
import { use } from '@kerf-js/veneer-core/kerf'
import { Button } from '../../Button'
import { tint } from '../bits'

import type { Ctx } from './calendar-state'

/** A month chip's heights in calendar.css: one line, two lines, and the gap between rows. The date above them is DATE_H. */
const CHIP_H = 18,
  CHIP_2H = 34,
  CHIP_GAP = 2,
  DATE_H = 16

function useMonthRoom(getGrid: () => HTMLDivElement | undefined) {
  // The weeks share the height the calendar has (calendar.css), so a whole month is in view: a day shows the chips its
  // row has room for, and "+N more" for the rest. `room` is the height under the date, measured; until then (and on a
  // phone, whose days draw dots) three and "+N more", as the server renders.
  const room = state<number | null>(null)
  onMount(() => {
    const grid = getGrid()
    const win = grid?.ownerDocument.defaultView
    if (!grid || !win || typeof win.ResizeObserver !== 'function') return
    const measure = () => {
      const cell = grid.querySelector<HTMLElement>('[role="gridcell"]')
      if (!cell) return
      const cs = win.getComputedStyle(cell)
      if (cs.display !== 'grid' || cs.gridTemplateColumns.split(' ').length > 1) {
        room.value = null
        return
      }
      const date =
        cell.querySelector<HTMLElement>('[aria-hidden="true"]:not([data-part])')?.offsetHeight ??
        DATE_H
      room.value =
        cell.clientHeight -
        parseFloat(cs.paddingBlockStart) -
        parseFloat(cs.paddingBlockEnd) -
        date -
        CHIP_GAP
    }
    const ro = new win.ResizeObserver(measure)
    ro.observe(grid)
    onCleanup(() => ro.disconnect())
  })
  return room
}

function monthSizing(
  room: { value: number | null },
  weeks: { value: ReturnType<typeof monthCells> },
  onDay: (iso: string) => CalEvent[],
) {
  /**
   * Long names take a second line on every day or on none, so one event reads the same on a quiet weekend as on a full
   * Tuesday: they do when every day in view has room for all its events at two lines each. Otherwise each name keeps
   * to one line, ending in an ellipsis if it must. A short name stays one line either way.
   */
  const twoLines = derived(() => {
    const r = room.value
    if (r === null) return false
    const most = Math.max(0, ...weeks.value.flatMap((w) => w.cells.map((x) => onDay(x.iso).length)))
    return most * (CHIP_2H + CHIP_GAP) - CHIP_GAP <= r
  })
  /** The chips a day shows, and how many go behind "+N more" (which takes a chip's room). */
  const shownOn = (list: CalEvent[]) => {
    const r = room.value
    const fit = r === null ? 4 : Math.max(1, Math.floor((r + CHIP_GAP) / (CHIP_H + CHIP_GAP)))
    const n = list.length <= fit ? list.length : Math.max(0, fit - 1)
    return {
      chips: list.slice(0, n).map((e) => ({ e, wrap: twoLines.value })),
      more: list.length - n,
    }
  }
  return shownOn
}

function monthOpenDay(c: Ctx) {
  return (iso: string) => {
    c.date.set(iso)
    c.view.set('day')
    c.say(`Day view, ${fmt(iso, { dateStyle: 'full' }, c.env.locale.value)}`)
  }
}

function monthLabel(c: Ctx) {
  return (iso: string, list: CalEvent[]) =>
    `${fmt(iso, { weekday: 'long', month: 'long', day: 'numeric' }, c.env.locale.value)}, ${list.length ? `${list.length} events: ${list.map((e) => e.title).join(', ')}` : 'no events'}${iso === c.env.today.value ? ', today' : ''}`
}

function useMonthGrid(c: Ctx) {
  const hint = uid('month')
  const weeks = derived(() => monthCells(c.date.value, c.first.value))
  const onDay = (iso: string) => eventsOn(c.visible.value, iso)
  const heads = derived(() => weekdays(c.first.value, c.env.locale.value))
  const cursor = state(untrack(() => c.date.value))
  watch(
    () => c.date.value,
    (d) => {
      cursor.value = d
    },
  )
  let grid: HTMLDivElement | undefined
  const more = state<{ iso: string; list: CalEvent[] } | null>(null)
  const moreOpen = state(false)
  const moreAt = state<HTMLElement | undefined>(undefined)
  let panel: HTMLDivElement | undefined
  use(
    popover,
    () => panel,
    () => ({
      open: moreOpen.value,
      trigger: moreAt.value!,
      side: 'bottom' as const,
      align: 'start' as const,
      onClose: () => (moreOpen.value = false),
    }),
  )
  const room = useMonthRoom(() => grid)
  const shownOn = monthSizing(room, weeks, onDay)
  const openDay = monthOpenDay(c)
  const onKey = (e: KeyboardEvent) => {
    const cell = (e.target as Element).closest?.<HTMLElement>('[role="gridcell"]')
    if (!cell) return
    const to = gridKey(
      e.key,
      e.shiftKey,
      cursor.value,
      c.first.value,
      getComputedStyle(cell).direction === 'rtl',
    )
    if (!to) return
    e.preventDefault()
    if (to === 'pick') return openDay(cursor.value)
    cursor.value = to
    if (monthStart(to) !== monthStart(c.date.value)) c.date.set(to)
    flush()
    grid?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus()
  }
  const onClick = (e: MouseEvent) => {
    const t = e.target as Element
    const btn = t.closest?.<HTMLElement>('[data-part="more"]')
    const cell = t.closest?.<HTMLElement>('[role="gridcell"]')
    if (!cell) return
    if (btn) {
      more.value = { iso: cell.dataset.date!, list: eventsOn(c.visible.value, cell.dataset.date!) }
      moreAt.value = btn
      moreOpen.value = true
      return
    }
    openDay(cell.dataset.date!)
  }
  const label = monthLabel(c)
  return {
    hint,
    weeks,
    heads,
    cursor,
    more,
    moreOpen,
    onDay,
    shownOn,
    openDay,
    onKey,
    onClick,
    label,
    setGrid: (n: HTMLDivElement) => (grid = n),
    setPanel: (n: HTMLDivElement) => (panel = n),
  }
}

function MonthCell({
  x,
  c,
  m,
}: {
  x: ReturnType<typeof monthCells>[number]['cells'][number]
  c: Ctx
  m: ReturnType<typeof useMonthGrid>
}) {
  return (
    <div
      data-part="day-cell"
      role="gridcell"
      tabindex={x.iso === m.cursor.value ? '0' : '-1'}
      data-date={x.iso}
      data-outside={x.outside ? '' : undefined}
      aria-current={x.iso === c.env.today.value ? 'date' : undefined}
    >
      <span class="sr">{m.label(x.iso, m.onDay(x.iso))}</span>
      <span aria-hidden="true">{ymd(x.iso)[2]}</span>
      {m.shownOn(m.onDay(x.iso)).chips.map(({ e, wrap }) => (
        <span
          key={e.id}
          data-part="chip"
          data-cal={e.cal ?? 1}
          data-wrap={wrap ? '' : undefined}
          style={tint(e.cal)}
          aria-hidden="true"
        >
          {e.title}
        </span>
      ))}
      {m.shownOn(m.onDay(x.iso)).more > 0 && (
        <button type="button" data-part="more" tabindex="-1" aria-hidden="true">
          +{m.shownOn(m.onDay(x.iso)).more} more
        </button>
      )}
    </div>
  )
}

export function MonthGrid({ c }: { c: Ctx }) {
  const model = useMonthGrid(untrack(() => c))
  const { hint, weeks, heads, more, moreOpen, openDay, onKey, onClick, setGrid, setPanel } = model
  return (
    <div data-part="grid" style="--veneer-cal-gutter:0px;--_days:7">
      <div data-part="head" aria-hidden="true">
        <span></span>
        {heads.value.map((h) => (
          <div key={h[0]} data-part="dayhead">
            <span>{h[1]}</span>
          </div>
        ))}
      </div>
      <span aria-hidden="true"></span>
      <div data-part="scroller">
        <div
          ref={setGrid}
          data-part="month"
          role="grid"
          aria-label={fmt(c.date.value, { month: 'long', year: 'numeric' }, c.env.locale.value)}
          aria-describedby={hint}
          onKeyDown={onKey}
          onClick={onClick}
        >
          {weeks.value.map((w) => (
            <div key={w.key} role="row">
              {w.cells.map((x) => (
                <MonthCell key={x.iso} x={x} c={c} m={model} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <span class="sr" id={hint}>
        Arrow keys move between days, Home and End to the week's ends, Page Up and Page Down by
        month, Enter opens the day.
      </span>
      <div
        ref={setPanel}
        data-scope="popover"
        data-part="content"
        popover="manual"
        role="dialog"
        aria-label={
          more.value
            ? fmt(more.value.iso, { month: 'long', day: 'numeric' }, c.env.locale.value)
            : 'Events'
        }
      >
        {more.value && (
          <div class="stack">
            {more.value.list.map((e) => (
              <Button
                key={e.id}
                emphasis="ghost"
                tone="neutral"
                size="sm"
                onClick={() => {
                  moreOpen.value = false
                  c.say(c.name(e))
                  openDay(dateOf(e.start))
                }}
              >
                {e.title}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
