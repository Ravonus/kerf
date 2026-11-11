import type { IsoDate } from '@kerf-js/veneer-core'
import type { State } from '@kerf-js/core'
import { Button } from '../Button'
import { InlineCalendar } from '../Calendar'
import { Alert } from '../Alert'
import { Skeleton } from '../Skeleton'
import { TimeField } from '../TimeField'
import { bookingModel } from './BookingCalendarModel'
import { BookingSlots, BookingDone, BookingConfirm } from './BookingCalendarParts'
import '@kerf-js/veneer-core/styles/app/booking.css'
import '@kerf-js/veneer-core/styles/rich/calendar-grid.css'

/** A start in minutes; `disabled` shows it taken rather than hiding it. */
export type BookingSlot = { s: number; disabled?: boolean | undefined }
/** The slot being booked, in minutes from midnight; manual when typed rather than picked. */
export type BookingDetails = { date: string; s: number; e: number; manual: boolean }
/** Props for BookingCalendar. */
export type BookingCalendarProps = {
  /** The times for a day: a list, or read from the date. */
  slots: BookingSlot[] | ((date: string) => BookingSlot[])
  /** The picked day: a state it writes, or a plain value with `onDateChange`. */
  date?: State<IsoDate | null> | IsoDate | undefined
  /** The day picked at the start, when the calendar keeps its own state. */
  defaultDate?: IsoDate | undefined
  /** Called with the day picked. Load that day's slots here. */
  onDateChange?: ((d: IsoDate) => void) | undefined
  duration?: number | undefined
  min?: string | undefined
  max?: string | undefined
  isDateUnavailable?: ((d: IsoDate) => boolean) | undefined
  loading?: boolean | undefined
  error?: unknown
  /** Pins today's date, for server rendering and tests. The browser's clock otherwise. */
  today?: string | undefined
  locale?: string | undefined
  /** `h12` for AM and PM, `h23` for a 24-hour clock. The locale's otherwise. */
  hourCycle?: string | undefined
  /** Rejecting keeps the confirm step and says why. */
  onBook: (b: BookingDetails) => void | Promise<unknown>
}

/**
 * BookingCalendar (07 §2.2): InlineCalendar plus slot buttons (`aria-pressed`), a confirm step with a manual time as the
 * fallback field path, and the arrival sweep on the confirmation card.
 */
export function BookingCalendar(p: BookingCalendarProps) {
  const model = bookingModel(() => p)
  return (
    <div ref={model.setRoot} data-scope="booking" data-part="root">
      <InlineCalendar
        aria-label="Choose a date"
        value={model.date.value}
        onValueChange={(d) => model.setDate(d as IsoDate)}
        today={model.env.today.value}
        locale={model.env.locale.value}
        min={p.min}
        max={p.max}
        isDateUnavailable={p.isDateUnavailable}
      />
      {model.stage.value === 'done' ? (
        <BookingDone model={model} />
      ) : (
        <>
          {!model.date.value && <p class="muted">Pick a date to see the times.</p>}
          {model.date.value && p.loading && (
            <div data-part="slots" aria-busy="true">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          )}
          {model.date.value && !p.loading && p.error && (
            <Alert tone="critical" title="Couldn't load the times" live>
              {p.error}
            </Alert>
          )}
          {model.date.value && !p.loading && !p.error && !model.manual.value && (
            <BookingSlots model={model} hourCycle={p.hourCycle} />
          )}
          {model.date.value && model.manual.value && (
            <TimeField
              id={`${model.id}-t`}
              label="Time"
              value={model.typed}
              locale={model.env.locale.value}
              hourCycle="h23"
              hint="Type any time."
            />
          )}
          {model.date.value && !p.error && (
            <div class="row">
              <Button
                emphasis="ghost"
                tone="neutral"
                size="sm"
                onClick={() => {
                  model.manual.value = !model.manual.value
                  model.stage.value = 'pick'
                }}
              >
                {model.manual.value ? 'Show suggested times' : 'Enter a time'}
              </Button>
              <span style="flex:1"></span>
              {model.stage.value === 'pick' && (
                <Button disabled={model.chosen.value === null} onClick={model.toConfirm}>
                  Continue
                </Button>
              )}
            </div>
          )}
          {model.stage.value === 'confirm' && <BookingConfirm model={model} />}
          {model.failed.value && (
            <Alert tone="critical" title="Couldn't book" live>
              {model.failed.value}
            </Alert>
          )}
        </>
      )}
    </div>
  )
}
