import { GlobeIcon, XIcon } from '@kerf/veneer-icons'
import { fmt, hhmm, type Override } from '@kerf/veneer-core'
import type { State } from '@kerf/core'
import { Button } from '../Button'
import { Switch } from '../Choice'
import { DateField } from '../DateField'
import { Input } from '../Field'
import { Select } from '../Select'
import { Day } from './AvailabilityEditor-day'
import type {
  AvailabilityActionsContext,
  weekActions,
  overrideActions,
} from './AvailabilityEditor-actions'

type View = Omit<AvailabilityActionsContext, 'env'> &
  ReturnType<typeof weekActions> &
  ReturnType<typeof overrideActions> & {
    id: string
    env: { locale: State<string>; today: State<string> }
    options: { readonly value: { value: string; label: string }[] }
    save: () => Promise<void>
    setSaveBtn: (el: HTMLElement) => void
    setRoot: (el: HTMLDivElement) => void
  }

const hours = (o: Override) =>
  o.ranges ? o.ranges.map((r) => `${hhmm(r[0])}–${hhmm(r[1])}`).join(', ') : 'Unavailable'

export function availabilityView(view: View) {
  const { p, week, id, dayName, options } = view
  const { setTime, addRange, removeRange, copyMonday } = view
  const { overrides, env, removeOverride, adding } = view
  const { status, busy, save, setSaveBtn, setRoot } = view
  return (
    <div ref={(n) => setRoot(n)} data-scope="availability">
      <div class="row">
        {p.zoneLabel && zoneLabel(() => p.zoneLabel)}
        <span style="flex:1"></span>
        <Button emphasis="ghost" tone="neutral" size="sm" onClick={copyMonday}>
          Copy Monday to weekdays
        </Button>
      </div>
      <ul data-part="week" aria-label="Weekly hours">
        {week.value.map((d) => (
          <Day
            key={d.day}
            day={d}
            id={id}
            name={dayName(d.day)}
            options={options.value}
            onToggle={(on) => toggleDay(() => d.day, on, view)}
            onTime={setTime}
            onAdd={addRange}
            onRemove={removeRange}
          />
        ))}
      </ul>
      <div class="stack">
        <span data-part="eyebrow">Date overrides</span>
        <ul data-part="overrides" aria-label="Date overrides">
          {overrides.value.map((o) => (
            <li key={o.id}>
              <span>
                <b>
                  {fmt(
                    o.date,
                    { weekday: 'short', month: 'short', day: 'numeric' },
                    env.locale.value,
                  )}
                </b>{' '}
                · {hours(o)}
                {o.note && overrideNote(() => o.note)}
              </span>
              <Button
                emphasis="ghost"
                tone="neutral"
                size="sm"
                icon={XIcon}
                label={`Remove override for ${fmt(o.date, { month: 'short', day: 'numeric' }, env.locale.value)}`}
                data-rov={o.id}
                onClick={() => removeOverride(o)}
              />
            </li>
          ))}
          {!overrides.value.length && emptyOverrides()}
        </ul>
        {adding.value ? newOverride(view) : addOverrideControl(view)}
      </div>
      <div class="row">
        <span style="flex:1"></span>
        <span class="muted" role="status">
          {status.value}
        </span>
        <Button
          size="sm"
          loading={busy.value}
          ref={(n: HTMLElement) => setSaveBtn(n)}
          onClick={save}
        >
          Save availability
        </Button>
      </div>
    </div>
  )
}

function newOverride({
  newDate,
  env,
  off,
  options,
  newFrom,
  newTo,
  newNote,
  addOverride,
  adding,
}: View) {
  return (
    <div class="stack" role="group" aria-label="New override">
      <DateField label="Date" value={newDate} today={env.today.value} locale={env.locale.value} />
      <Switch
        checked={off.value}
        onChange={(e: Event) => (off.value = (e.currentTarget as HTMLInputElement).checked)}
      >
        Unavailable all day
      </Switch>
      {!off.value && (
        <div class="row">
          <Select
            label="From"
            options={options.value}
            value={newFrom.value}
            onChange={(e: Event) => (newFrom.value = (e.currentTarget as HTMLInputElement).value)}
          />
          <Select
            label="To"
            options={options.value}
            value={newTo.value}
            onChange={(e: Event) => (newTo.value = (e.currentTarget as HTMLInputElement).value)}
          />
        </div>
      )}
      <Input
        label="Note"
        value={newNote.value}
        onInput={(e) => (newNote.value = e.currentTarget.value)}
      />
      <div class="row">
        <Button size="sm" disabled={!newDate.value} onClick={addOverride}>
          Add
        </Button>
        <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => (adding.value = false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function addOverrideControl({ adding }: View) {
  return (
    <div class="row">
      <Button
        emphasis="outline"
        tone="neutral"
        size="sm"
        data-add-ov=""
        onClick={() => (adding.value = true)}
      >
        Add an override
      </Button>
    </div>
  )
}

function zoneLabel(label: () => string | undefined) {
  return (
    <span class="muted">
      <GlobeIcon /> Times in {label()}
    </span>
  )
}

function emptyOverrides() {
  return (
    <li>
      <span class="muted">No overrides. Add one for holidays or a half day.</span>
    </li>
  )
}

function overrideNote(note: () => string | undefined) {
  return (
    <>
      <br />
      <small>{note()}</small>
    </>
  )
}

function toggleDay(day: () => number, on: boolean, { patch, say, dayName }: View) {
  patch(day(), (x) => ({ ...x, on }))
  say(`${dayName(day())} ${on ? 'available' : 'unavailable'}`)
}
