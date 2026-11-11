import { PlusIcon } from '@kerf-js/veneer-icons'
import type { CalEvent } from '@kerf-js/veneer-core'
import type { State } from '@kerf-js/core'
import { Button } from '../Button'
import { AgendaPage } from './AgendaPage'
import { AgendaStrip } from './AgendaStrip'
import { agendaModel } from './AgendaModel'
import { EventEditor, type CalendarSource } from './EventEditor'
import { MoveSheet } from './MoveSheet'
import '@kerf-js/veneer-core/styles/app/agenda.css'
import '@kerf-js/veneer-core/styles/components/fab.css'
export * from './AgendaDay'

/** Props for Agenda. */
export type AgendaProps = {
  events: CalEvent[]
  /** The day it opens on: a state it writes as you page, or a plain value. */
  date?: State<string> | string | undefined
  defaultDate?: string | undefined
  /** Called with the new day when you page or jump to today. */
  onDateChange?: ((d: string) => void) | undefined
  title?: unknown
  /** The calendars the events belong to, for their colours and names. */
  calendars?: CalendarSource[] | undefined
  /** The IANA zone times are shown in, such as `Europe/Berlin`. The browser's otherwise. */
  timeZone?: string | undefined
  /** Pins today's date, for server rendering and tests. The browser's clock otherwise. */
  today?: string | undefined
  /** Pins the current time, for server rendering and tests. The browser's clock otherwise. */
  now?: string | undefined
  locale?: string | undefined
  /** `h12` for AM and PM, `h23` for a 24-hour clock. The locale's otherwise. */
  hourCycle?: string | undefined
  firstDayOfWeek?: number | undefined
  /** Long press: open your own sheet. Without it the built-in MoveSheet opens and calls `onMove`. */
  onLongPress?: ((e: CalEvent) => void) | undefined
  onMove?: (e: CalEvent, to: { start: string; end: string; resource?: string | undefined }) => void
  onOpen?: ((e: CalEvent) => void) | undefined
  /** The FAB opens the editor; Save calls this. */
  onCreate?: ((e: CalEvent) => void) | undefined
}

/**
 * The phone agenda (07 §2.3, `#cal-phone`): a week strip of APG tabs with dots per source, three day pages that swipe, a
 * now marker, "1 h free" gaps and the FAB. A long press (or Shift+F10) opens the MoveSheet.
 */
export function Agenda(p: AgendaProps) {
  const model = agendaModel(() => p)

  return (
    <div ref={model.setRoot} data-scope="agenda" data-part="root">
      <div data-part="app-bar">
        <h3 data-part="app-title">{p.title ?? model.month.value}</h3>
        <span data-part="spacer"></span>
        <Button
          emphasis="outline"
          tone="neutral"
          size="sm"
          onClick={() => model.go(model.env.today.value)}
        >
          Today
        </Button>
      </div>
      <AgendaStrip
        id={model.id}
        week={model.week.value}
        date={model.date.value}
        today={model.env.today.value}
        locale={model.env.locale.value}
        events={p.events}
        onTabs={model.onTabs}
        go={model.go}
      />
      <div
        ref={model.setView}
        data-part="viewport"
        id={`${model.id}-panel`}
        role="tabpanel"
        aria-labelledby={`${model.id}-${model.date.value}`}
        onKeyDown={model.onKey}
        onClick={model.onClick}
      >
        <div ref={model.setTrack} data-part="track">
          {model.pages.value.map((g) => (
            <AgendaPage
              key={g.day}
              day={g.day}
              offset={g.at}
              locale={model.env.locale.value}
              events={p.events}
              now={model.now.value}
              hourCycle={p.hourCycle}
            />
          ))}
        </div>
      </div>
      {p.onCreate && (
        <button data-scope="fab" type="button" aria-label="New event" onClick={model.create}>
          <PlusIcon />
        </button>
      )}
      <MoveSheet
        open={model.sheet}
        event={model.moving.value}
        events={p.events}
        firstDayOfWeek={model.first.value}
        locale={model.env.locale.value}
        hourCycle={p.hourCycle}
        onMove={model.moved}
        onClose={() => (model.lifted.value = null)}
      />
      <EventEditor
        open={model.editing}
        event={model.draft.value}
        isNew
        calendars={p.calendars}
        timeZone={p.timeZone}
        locale={model.env.locale.value}
        today={model.env.today.value}
        onSave={(e) => p.onCreate?.(e)}
      />
    </div>
  )
}
