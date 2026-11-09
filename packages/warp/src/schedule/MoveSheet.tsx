import { LeftIcon, RightIcon } from '@weft-js/warp-icons'
import {
  clock,
  clockRange,
  dateOf,
  fmt,
  longDuration,
  moveSlots,
  slotOf,
  weekDates,
  type CalEvent,
  type Slot,
} from '@weft-js/warp-core'
import { derived, state, untrack, type State } from '@weft-js/core'
import { Alert } from '../Alert'
import { Button } from '../Button'
import { Chip } from '../Chip'
import { Drawer } from '../Drawer'
import { SweepParts, confirmSweep } from './bits'
import '@weft-js/warp-core/styles/app/booking.css'

/** Props for MoveSheet. */
export type MoveSheetProps = {
  open: State<boolean>
  event: CalEvent | null
  /** Everything else on the calendar: a start that collides is disabled. */
  events: CalEvent[]
  /** The day the week strip starts on, 0 for Sunday to 6. Default 1, Monday. */
  firstDayOfWeek?: number | undefined
  locale?: string | undefined
  /** `h12` for AM and PM, `h23` for a 24-hour clock. The locale's otherwise. */
  hourCycle?: string | undefined
  step?: number | undefined
  onMove: (e: CalEvent, to: Slot) => void
  onClose?: (() => void) | undefined
}

/** The move sheet (07 §2.2, `#move-sheet`): a bottom Sheet with day, start and duration, the touch path for a drag. */
export function MoveSheet(p: MoveSheetProps) {
  const title = derived(() => (p.event ? `Move “${p.event.title}”` : 'Move event'))
  const hold = state<(() => void) | null>(null)
  const go = () => hold.value?.()
  const cancel = () => {
    p.open.value = false
    p.onClose?.()
  }
  return (
    <Drawer
      open={p.open}
      side="bottom"
      title={title.value}
      description={
        p.event
          ? `${longDuration(slotOf(p.event).e - slotOf(p.event).s)} · now ${fmt(dateOf(p.event.start), { weekday: 'short' }, p.locale ?? 'en-US')} ${clockRange(slotOf(p.event).s, slotOf(p.event).e, p.locale ?? 'en-US', p.hourCycle)}`
          : undefined
      }
      footer={
        <>
          <Button emphasis="outline" tone="neutral" onClick={cancel}>
            Cancel
          </Button>
          <Button onClick={go}>Move event</Button>
        </>
      }
    >
      {p.event && p.open.value && (
        <Body key={p.event.id} event={p.event} props={p} bind={(f) => (hold.value = f)} />
      )}
    </Drawer>
  )
}

function bodyModel(event: CalEvent, p: MoveSheetProps, bind: (go: () => void) => void) {
  const e = untrack(() => event)
  const origin = slotOf(e)
  const day = state<string>(origin.date)
  const start = state(origin.s)
  const len = state(origin.e - origin.s)
  const locale = derived(() => p.locale ?? 'en-US')
  const week = derived(() => weekDates(origin.date, p.firstDayOfWeek ?? 1))
  const slots = derived(() => moveSlots(p.events, e, { date: day.value, len: len.value }))
  const stepBy = untrack(() => p.step ?? 15)
  const go = () => {
    const to = {
      date: day.value,
      s: start.value,
      e: start.value + len.value,
      resource: origin.resource,
    }
    p.open.value = false
    p.onMove(e, to)
    p.onClose?.()
  }
  untrack(() => bind(go))
  const pick = (s: number, ev: MouseEvent) => {
    start.value = s
    confirmSweep(ev.currentTarget as Element)
  }
  return { e, day, start, len, locale, week, slots, stepBy, pick }
}

function Body({
  event,
  props: p,
  bind,
}: {
  event: CalEvent
  props: MoveSheetProps
  bind: (go: () => void) => void
}) {
  const { e, day, start, len, locale, week, slots, stepBy, pick } = untrack(() =>
    bodyModel(event, p, bind),
  )
  return (
    <div class="stack">
      <div class="chips" role="group" aria-label="Day">
        {week.value.map((d) => (
          <Chip key={d} pressed={d === day.value} onClick={() => (day.value = d)}>
            {fmt(d, { weekday: 'short', day: 'numeric' }, locale.value)}
          </Chip>
        ))}
      </div>
      <div data-scope="booking" data-part="root">
        <div data-part="slots" role="group" aria-label="Start time">
          {slots.value.map((x) => (
            <button
              key={x.s}
              type="button"
              data-part="slot"
              data-sweep=""
              aria-pressed={x.s === start.value ? 'true' : 'false'}
              disabled={x.busy}
              onClick={(ev: MouseEvent) => pick(x.s, ev)}
            >
              <SweepParts />
              {clock(x.s, locale.value, p.hourCycle)}
            </button>
          ))}
        </div>
      </div>
      <div class="row" role="group" aria-label="Duration">
        <Button
          emphasis="outline"
          tone="neutral"
          size="sm"
          label="Shorter"
          icon={LeftIcon}
          disabled={len.value <= stepBy}
          onClick={() => (len.value = Math.max(stepBy, len.value - stepBy))}
        />
        <output aria-live="polite">{longDuration(len.value)}</output>
        <Button
          emphasis="outline"
          tone="neutral"
          size="sm"
          label="Longer"
          icon={RightIcon}
          onClick={() => (len.value += stepBy)}
        />
      </div>
      {e.recurrence && (
        <Alert tone="info" title="This event repeats">
          Moving changes this one only. Use Edit for the series.
        </Alert>
      )}
    </div>
  )
}
