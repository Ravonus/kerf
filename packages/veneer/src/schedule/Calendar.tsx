import { untrack, type State } from '@kerf-js/core'
import { uid, type CalEvent, type CalView } from '@kerf-js/veneer-core'
import '@kerf-js/veneer-core/styles/components/tabs.css'
import '@kerf-js/veneer-core/styles/app/calendar.css'
import '@kerf-js/veneer-core/styles/layout/edges.css'
import { type LiveState } from '../parts'
import { type CalendarSource } from './EventEditor'

import { useCalendarActions, useCalendarNav } from './Calendar/calendar-shell'
import { useCalendar } from './Calendar/calendar-state'
import { CalendarDialogs } from './Calendar/CalendarDialogs'
import { CalendarMain } from './Calendar/CalendarMain'
import { MiniMonth } from './Calendar/MiniMonth'
import type { Ctx } from './Calendar/calendar-state'
import { CalendarToolbar } from './Calendar/CalendarToolbar'

/** Which occurrences of a repeating event a change covers. */
export type RecurrenceScope = 'this' | 'following' | 'all'
/** Where an edited event lands: its new times, its timeline row, and which occurrences of a repeat it covers. */
export type EventChange = {
  start: string
  end: string
  resource?: string | undefined
  scope?: RecurrenceScope | undefined
}
/** A timeline row: a room or a person. `meta` is the quiet line under its name ("8 seats"). */
export type Resource = { id: string; name: string; meta?: string }
type Reason = 'pointer' | 'keyboard' | 'touch'

/** Props for Calendar. */
export type CalendarProps = {
  /** The events to show, in every view. Times are wall-clock ISO strings (`2026-11-04T09:30`), or dates for all-day ones. */
  events: CalEvent[]
  /** The calendars events belong to (an event's `cal`): the rail lists them with a checkbox each, and the editor offers them. */
  calendars?: CalendarSource[] | undefined
  /** The view showing: a State to share it, or a value. */
  view?: State<CalView> | CalView | undefined
  /** The view it opens on when `view` isn't given. Week without either. */
  defaultView?: CalView | undefined
  /** Hears every change of view, by tab, key or the mini month. */
  onViewChange?: ((v: CalView) => void) | undefined
  /** The views offered as tabs, in this order. All six without it. */
  views?: CalView[] | undefined
  /** The date the view is on (`2026-11-04`): a State to share it, or a value. */
  date?: State<string> | string | undefined
  /** The date it opens on when `date` isn't given. Today without either. */
  defaultDate?: string | undefined
  /** Hears the new date when the arrows, Today, the mini month or a drill-in move it. */
  onDateChange?: ((d: string) => void) | undefined
  /** The toolbar chip's zone. Without one, wall times show as they are. */
  timeZone?: State<string | null> | string | undefined
  /** Hears a zone picked from the toolbar chip, or null for wall times. */
  onTimeZoneChange?: ((z: string | null) => void) | undefined
  /** Secondary zones in the rail. */
  zones?: { label: string; zone: string }[] | undefined
  /** Today's date (`2026-11-02`), marked in every view. The browser's date after mount without it, so hydration writes nothing. */
  today?: string | undefined
  /** The now line's wall time; the browser's clock after mount without it. */
  now?: string | undefined
  /** The locale for day and month names, times and the first day of the week. The browser's without it. */
  locale?: string | undefined
  /** `h12` or `h23` to force a clock; the locale's without it. */
  hourCycle?: string | undefined
  /** The week's first day, 0 for Sunday to 6 for Saturday. The locale's without it. */
  firstDayOfWeek?: number | undefined
  /** Minutes a drag or resize snaps to. 15 without it. */
  snap?: number | undefined
  /**
   * Working hours as minutes from midnight, `[start, end]`: `[540, 1020]` is 09:00 to 17:00 (not `[9, 17]`). The rest of
   * the day is banded, and Week and Day open scrolled to just before `start`. 08:00 to 18:00 without it.
   */
  workingHours?: [number, number] | undefined
  /** The toolbar LiveStatus. */
  live?: LiveState | undefined
  /** Timeline rows; events point at one with `resource`. */
  resources?: Resource[] | undefined
  /** The timeline's span, in minutes from midnight like `workingHours`: `[480, 1080]` (08:00 to 18:00) without it. */
  timeline?: [number, number] | undefined
  /** Year view's counts; from `events` without it. */
  counts?: Record<string, number> | undefined
  /** Turns off dragging, resizing, creating and the keyboard move mode. Events still open their popover. */
  readOnly?: boolean | undefined
  /** A rejected promise puts the event back and announces why (07 §2.6). */
  onMove?: ((e: CalEvent, to: EventChange, reason: Reason) => void | Promise<unknown>) | undefined
  /** An event's edge dragged to a new time. A rejected promise puts it back and announces why. */
  onResize?: ((e: CalEvent, to: EventChange, reason: Reason) => void | Promise<unknown>) | undefined
  /** A new event saved from the editor, after a drag over empty time, a press on a slot or New event. */
  onCreate?: ((e: CalEvent) => void) | undefined
  /** An event saved from the editor; `scope` says which of a repeating event's occurrences. */
  onEdit?: ((e: CalEvent, scope?: RecurrenceScope) => void) | undefined
  /** An event deleted after its confirmation; `scope` says which of a repeating event's occurrences. */
  onDelete?: ((e: CalEvent, scope?: RecurrenceScope) => void) | undefined
  /** An event's popover opened, by press or Enter. */
  onOpen?: ((e: CalEvent) => void) | undefined
  /** Join pressed in the popover of an event with a `video` link. */
  onJoin?: ((e: CalEvent) => void) | undefined
}

export { nowSpans } from './Calendar/now-spans'

function CalendarRail({
  p,
  c,
  nav,
  actions,
}: {
  p: CalendarProps
  c: Ctx
  nav: ReturnType<typeof useCalendarNav>
  actions: ReturnType<typeof useCalendarActions>
  id: string
}) {
  return (
    <aside data-part="rail" aria-label="Calendars">
      {!nav.tablet.value && <MiniMonth c={c} />}
      {p.calendars && (
        <div class="stack">
          <span data-part="eyebrow">My calendars</span>
          <ul data-part="sources">
            {p.calendars.map((s) => (
              <li key={s.id}>
                <label data-cal={s.id}>
                  <input
                    type="checkbox"
                    checked={!c.off.value.includes(s.id)}
                    onChange={(e: Event) =>
                      actions.toggle(s.id, (e.currentTarget as HTMLInputElement).checked)
                    }
                  />
                  {s.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.zones && (
        <div class="stack">
          <span data-part="eyebrow">Time zones</span>
          {p.zones.map((z) => (
            <span key={z.zone} class="row">
              <span>{z.label}</span>
              <span style="flex:1"></span>
              <span class="muted">{actions.zoneNow(z.zone)}</span>
            </span>
          ))}
        </div>
      )}
    </aside>
  )
}

/**
 * Calendar (07 §2, `#cal-desk`): toolbar, rail, and Month, Week, Day, Agenda, Timeline and Year behind APG tabs. Drag
 * moves, resizes and creates on a 15-minute snap; `M` is the keyboard move mode, a long press opens the MoveSheet, and
 * the editor's fields do it all without either. `today` and `now` are props or arrive after mount, so hydration writes
 * nothing. A week shows all seven days when every name fits its box, and on a narrower one keeps each day readable and
 * scrolls sideways under its hours; event names are never cut (the hours lengthen for a long one),
 * and below 1000px the mini month moves into the title's popover.
 */
export function Calendar(p: CalendarProps) {
  const id = uid('cal')
  const c = useCalendar(untrack(() => p))
  const nav = useCalendarNav(
    untrack(() => p),
    c,
  )
  const actions = useCalendarActions(
    untrack(() => p),
    c,
  )
  return (
    <div ref={nav.setRoot} data-scope="calendar" data-part="root">
      <CalendarToolbar p={p} c={c} nav={nav} actions={actions} id={id} />
      <div data-part="layout" style="min-block-size:0">
        <CalendarRail p={p} c={c} nav={nav} actions={actions} id={id} />
        <CalendarMain p={p} c={c} nav={nav} actions={actions} id={id} />
      </div>
      <CalendarDialogs p={p} c={c} nav={nav} actions={actions} id={id} />
    </div>
  )
}
