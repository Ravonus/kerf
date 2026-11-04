import {
  at,
  asTime,
  dateOf,
  fmt,
  minuteOf,
  minutes,
  type CalEvent,
  type IsoDate,
  type IsoTime,
} from '@weft-js/warp-core'
import { derived, flush, state, untrack, type State } from '@weft-js/core'
import { Button } from '../Button'
import { Switch } from '../Choice'
import { DateField } from '../DateField'
import { Drawer } from '../Drawer'
import { Input } from '../Field'
import { RecurrenceField } from '../RecurrenceField'
import { TimeZoneSelect } from '../RichSelect'
import { Select } from '../Select'
import { TimeField } from '../TimeField'
import './bits'

/** A calendar an event can live in. */
export type CalendarSource = { id: number; name: string }
/** Props for EventEditor. */
export type EventEditorProps = {
  open: State<boolean>
  /** What it edits; rebuild the fields by passing a new object. */
  event: CalEvent | null
  isNew?: boolean | undefined
  calendars?: CalendarSource[] | undefined
  /** The IANA zone the times are edited in, such as `Europe/Berlin`. */
  timeZone?: string | undefined
  locale?: string | undefined
  /** Pins today's date, for server rendering and tests. The browser's clock otherwise. */
  today?: string | undefined
  onSave: (e: CalEvent) => void
  onCancel?: (() => void) | undefined
}

/** The event editor (07 §2.1, `#ev-sheet`): a Sheet, right on wide screens and bottom on a phone; the fields path for every drag. */
export function EventEditor(p: EventEditorProps) {
  let form: HTMLFormElement | undefined
  const label = derived(() => (p.isNew ? 'New event' : 'Edit event'))
  const save = () => form?.requestSubmit()
  const cancel = () => {
    p.open.value = false
    p.onCancel?.()
  }
  return (
    <Drawer
      open={p.open}
      title={label.value}
      description={
        p.event
          ? fmt(
              dateOf(p.event.start),
              { weekday: 'long', month: 'short', day: 'numeric' },
              p.locale ?? 'en-US',
            )
          : undefined
      }
      footer={
        <>
          <Button emphasis="outline" tone="neutral" onClick={cancel}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      {p.event && p.open.value && (
        <Fields
          key={p.event.id}
          draft={p.event}
          props={p}
          form={(n: HTMLFormElement) => (form = n)}
        />
      )}
    </Drawer>
  )
}

function Fields({
  draft,
  props: p,
  form,
}: {
  draft: CalEvent
  props: EventEditorProps
  form: (n: HTMLFormElement) => void
}) {
  const e = untrack(() => draft)
  const title = state(e.title)
  const date = state<IsoDate | null>(dateOf(e.start))
  const start = state<IsoTime | null>(asTime(minuteOf(e.start)))
  const end = state<IsoTime | null>(asTime(minuteOf(e.end)))
  const repeats = state(!!e.recurrence)
  const rule = state<string | null>(e.recurrence ?? 'FREQ=WEEKLY')
  const zone = state<string | null>(e.tz ?? untrack(() => p.timeZone) ?? null)
  const place = state(e.location ?? '')
  const cal = state(String(e.cal ?? 1))
  // '' not undefined: Field only builds its message row for an error it knows about at setup
  const titleError = state('')
  const timeError = state('')
  const sources = derived(() =>
    (p.calendars ?? [{ id: 1, name: 'Calendar' }]).map((c) => ({
      value: String(c.id),
      label: c.name,
    })),
  )
  let box: HTMLFormElement | undefined
  const submit = (ev: Event) => {
    ev.preventDefault()
    const s = minutes(start.value ?? '00:00'),
      z = minutes(end.value ?? '00:00')
    titleError.value = title.value.trim() ? '' : 'Give it a title.'
    timeError.value = e.allDay || z > s ? '' : 'Ends before it starts'
    if (titleError.value || timeError.value) {
      flush()
      box?.querySelector<HTMLElement>('[aria-invalid="true"], [aria-invalid="true"] input')?.focus()
      return
    }
    const d = date.value ?? dateOf(e.start)
    p.open.value = false
    p.onSave({
      ...e,
      title: title.value.trim(),
      start: e.allDay ? d : at(d, s),
      end: e.allDay ? e.end : at(d, z),
      recurrence: repeats.value ? rule.value : null,
      tz: zone.value && zone.value !== p.timeZone ? zone.value : e.tz,
      location: place.value || undefined,
      cal: +cal.value,
    })
  }
  return (
    <form
      ref={(n) => {
        box = n
        form(n)
      }}
      class="stack"
      onSubmit={submit}
      noValidate
    >
      <Input
        label="Title"
        value={title.value}
        error={titleError.value}
        required
        autofocus
        onInput={(i) => (title.value = i.currentTarget.value)}
      />
      <DateField label="Date" value={date} today={p.today} locale={p.locale} />
      {!e.allDay && (
        <div class="row">
          <TimeField label="Starts" value={start} locale={p.locale} hourCycle="h23" />
          <TimeField
            label="Ends"
            value={end}
            locale={p.locale}
            hourCycle="h23"
            error={timeError.value}
          />
        </div>
      )}
      <Switch
        checked={repeats.value}
        onChange={(i: Event) => (repeats.value = (i.currentTarget as HTMLInputElement).checked)}
      >
        Repeats
      </Switch>
      {repeats.value && (
        <RecurrenceField
          label="Repeats"
          value={rule}
          dtstart={date.value ?? dateOf(e.start)}
          locale={p.locale}
        />
      )}
      <TimeZoneSelect
        label="Time zone"
        value={zone}
        referenceDate={date.value ?? undefined}
        today={p.today}
        locale={p.locale}
      />
      <Input
        label="Location or link"
        value={place.value}
        onInput={(i) => (place.value = i.currentTarget.value)}
      />
      <Select
        label="Calendar"
        options={sources.value}
        value={cal.value}
        onChange={(i: Event) => (cal.value = (i.currentTarget as HTMLInputElement).value)}
      />
    </form>
  )
}
