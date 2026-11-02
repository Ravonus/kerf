import { AlertIcon, GlobeIcon, PlusIcon, XIcon } from '@weft/icons'
import { announce, fmt, hhmm, nextRange, rangeIssues, timeOptions, uid, weekValid, type IsoDate, type Override, type Range, type WeekDay } from '@weft/warp-core'
import { derived, flush, state, untrack } from 'weft'
import { Button } from '../Button'
import { Switch } from '../Choice'
import { DateField } from '../DateField'
import { Input } from '../Field'
import { usePickerEnv } from '../Picker'
import { Select } from '../Select'
import { confirmSweep } from './bits'
import '@weft/warp-core/styles/app/availability.css'

export type Availability = { week: WeekDay[]; overrides: Override[] }
export type AvailabilityEditorProps = {
  defaultValue: Availability
  /** "New York (EDT)". */
  zoneLabel?: string
  /** Pins today's date, for server rendering and tests. The browser's clock otherwise. */
  today?: string
  locale?: string
  /** Times on offer, minutes. */
  from?: number
  to?: number
  step?: number
  /** Rejecting says so and keeps the changes. */
  onSave: (v: Availability) => void | Promise<unknown>
}

const optionsOf = (from?: number, to?: number, step?: number) => timeOptions(from, to, step).map(m => ({ value: String(m), label: hhmm(m) }))

/**
 * AvailabilityEditor (07 §6.4): a Switch and From/To ranges per weekday, "Copy Monday to weekdays", date overrides. Ranges
 * validate on change; Save stays blocked with focus on the first invalid time. Saves nothing until Save.
 */
export function AvailabilityEditor(p: AvailabilityEditorProps) {
  const id = uid('avail')
  const env = usePickerEnv(() => p.locale, () => p.today)
  const seed = untrack(() => p.defaultValue)
  const week = state<WeekDay[]>(seed.week.map(d => ({ ...d, ranges: d.ranges.map(r => [...r] as Range) })))
  const overrides = state<Override[]>(seed.overrides.map(o => ({ ...o })))
  const status = state('No unsaved changes')
  const busy = state(false)
  const adding = state(false)
  const newDate = state<IsoDate | null>(null)
  const newNote = state('')
  const off = state(true)
  const newFrom = state('540')
  const newTo = state('780')
  const options = derived(() => optionsOf(p.from, p.to, p.step))
  const dayName = (d: number) => fmt(`2024-01-${String(7 + d).padStart(2, '0')}`, { weekday: 'long' }, env.locale.value)
  let root: HTMLDivElement | undefined
  let saveBtn: HTMLElement | undefined
  const say = (t: string, loud = false) => root && announce(root.ownerDocument, t, loud)
  const dirty = () => (status.value = 'Unsaved changes')
  const patch = (day: number, f: (d: WeekDay) => WeekDay) => { week.value = week.value.map(d => (d.day === day ? f(d) : d)); dirty() }
  const setTime = (day: number, at: number, side: 0 | 1, v: number) => {
    patch(day, d => ({ ...d, ranges: d.ranges.map((r, i) => (i === at ? (side ? [r[0], v] : [v, r[1]]) as Range : r)) }))
    const err = rangeIssues(week.value.find(d => d.day === day)!.ranges)[at]
    if (err) say(`${dayName(day)}: ${err}`, true)
  }
  const focus = (sel: string) => { flush(); root?.querySelector<HTMLElement>(sel)?.focus() }
  const addRange = (day: number) => { patch(day, d => ({ ...d, ranges: [...d.ranges, nextRange(d.ranges, p.to)] })); say(`Range added on ${dayName(day)}`); focus(`[data-day-of="${day}"] [data-part="range"]:last-child button[data-part="input"]`) }
  const removeRange = (day: number, at: number) => { patch(day, d => ({ ...d, ranges: d.ranges.filter((_, i) => i !== at) })); say(`Range removed from ${dayName(day)}`); focus(`[data-add="${day}"]`) }
  const copyMonday = () => {
    const mon = week.value.find(d => d.day === 1)
    if (!mon) return
    week.value = week.value.map(d => (d.day >= 2 && d.day <= 5 ? { ...d, on: mon.on, ranges: mon.ranges.map(r => [...r] as Range) } : d))
    dirty()
    say(`${dayName(1)}'s hours copied to ${dayName(2)} through ${dayName(5)}`)
  }
  const addOverride = () => {
    if (!newDate.value) return
    const o: Override = { id: uid('ov'), date: newDate.value, ranges: off.value ? null : [[+newFrom.value, +newTo.value]], note: newNote.value || undefined }
    overrides.value = [...overrides.value, o]
    adding.value = false
    newDate.value = null
    newNote.value = ''
    dirty()
    say(`Override added for ${fmt(o.date, { dateStyle: 'long' }, env.locale.value)}`)
    focus(`[data-rov="${o.id}"]`)
  }
  const removeOverride = (o: Override) => { overrides.value = overrides.value.filter(x => x.id !== o.id); dirty(); say(`Override for ${fmt(o.date, { dateStyle: 'long' }, env.locale.value)} removed`); focus('[data-add-ov]') }
  const save = async () => {
    if (!weekValid(week.value)) {
      say('Fix the highlighted ranges before saving.', true)
      root?.querySelector<HTMLElement>('[data-part="range"][data-invalid] button[data-part="input"]')?.focus()
      return
    }
    busy.value = true
    try {
      await p.onSave({ week: week.value, overrides: overrides.value })
      status.value = 'Saved · booking pages updated'
      confirmSweep(saveBtn)
      say('Availability saved')
    } catch (err: any) {
      status.value = `Couldn't save: ${err?.message ?? 'try again'}`
      say(status.value, true)
    } finally { busy.value = false }
  }
  const hours = (o: Override) => (o.ranges ? o.ranges.map(r => `${hhmm(r[0])}–${hhmm(r[1])}`).join(', ') : 'Unavailable')
  return (
    <div ref={(n: any) => (root = n)} data-scope="availability">
      <div class="row">
        {p.zoneLabel && <span class="muted"><GlobeIcon /> Times in {p.zoneLabel}</span>}
        <span style="flex:1"></span>
        <Button emphasis="ghost" tone="neutral" size="sm" onClick={copyMonday}>Copy Monday to weekdays</Button>
      </div>
      <ul data-part="week" aria-label="Weekly hours">
        {week.value.map(d => <Day key={d.day} day={d} id={id} name={dayName(d.day)} options={options.value} onToggle={on => { patch(d.day, x => ({ ...x, on })); say(`${dayName(d.day)} ${on ? 'available' : 'unavailable'}`) }} onTime={setTime} onAdd={addRange} onRemove={removeRange} />)}
      </ul>
      <div class="stack">
        <span data-part="eyebrow">Date overrides</span>
        <ul data-part="overrides" aria-label="Date overrides">
          {overrides.value.map(o => (
            <li key={o.id}>
              <span><b>{fmt(o.date, { weekday: 'short', month: 'short', day: 'numeric' }, env.locale.value)}</b> · {hours(o)}{o.note && <><br /><small>{o.note}</small></>}</span>
              <Button emphasis="ghost" tone="neutral" size="sm" icon={XIcon} label={`Remove override for ${fmt(o.date, { month: 'short', day: 'numeric' }, env.locale.value)}`} data-rov={o.id} onClick={() => removeOverride(o)} />
            </li>
          ))}
          {!overrides.value.length && <li><span class="muted">No overrides. Add one for holidays or a half day.</span></li>}
        </ul>
        {adding.value
          ? <div class="stack" role="group" aria-label="New override">
              <DateField label="Date" value={newDate} today={env.today.value} locale={env.locale.value} />
              <Switch checked={off.value} onChange={(e: any) => (off.value = e.currentTarget.checked)}>Unavailable all day</Switch>
              {!off.value && <div class="row"><Select label="From" options={options.value} value={newFrom.value} onChange={(e: any) => (newFrom.value = e.currentTarget.value)} /><Select label="To" options={options.value} value={newTo.value} onChange={(e: any) => (newTo.value = e.currentTarget.value)} /></div>}
              <Input label="Note" value={newNote.value} onInput={e => (newNote.value = e.currentTarget.value)} />
              <div class="row"><Button size="sm" disabled={!newDate.value} onClick={addOverride}>Add</Button><Button emphasis="ghost" tone="neutral" size="sm" onClick={() => (adding.value = false)}>Cancel</Button></div>
            </div>
          : <div class="row"><Button emphasis="outline" tone="neutral" size="sm" data-add-ov="" onClick={() => (adding.value = true)}>Add an override</Button></div>}
      </div>
      <div class="row">
        <span style="flex:1"></span>
        <span class="muted" role="status">{status.value}</span>
        <Button size="sm" loading={busy.value} ref={(n: HTMLElement) => (saveBtn = n)} onClick={save}>Save availability</Button>
      </div>
    </div>
  )
}

function Day({ day, id, name, options, onToggle, onTime, onAdd, onRemove }: { day: WeekDay; id: string; name: string; options: { value: string; label: string }[]; onToggle: (on: boolean) => void; onTime: (d: number, at: number, side: 0 | 1, v: number) => void; onAdd: (d: number) => void; onRemove: (d: number, at: number) => void }) {
  const issues = derived(() => rangeIssues(day.ranges))
  const rows = derived(() => day.ranges.map((r, at) => ({ r, at, k: `${day.day}-${at}`, error: issues.value[at] })))
  return (
    <li data-part="day" data-day-of={day.day}>
      <Switch checked={day.on} onChange={(e: any) => onToggle(e.currentTarget.checked)}>{name}</Switch>
      <div data-part="ranges">
        {day.on
          ? rows.value.map(x => (
              <div key={x.k} data-part="range" data-invalid={x.error ? '' : undefined} role="group" aria-label={`${name}, range ${x.at + 1}`}>
                <Select label="From" size="sm" options={options} value={String(x.r[0])} aria-invalid={x.error ? 'true' : undefined} aria-describedby={x.error ? `${id}-${x.k}-e` : undefined} hold={!!x.error} onChange={(e: any) => onTime(day.day, x.at, 0, +e.currentTarget.value)} />
                <Select label="To" size="sm" options={options} value={String(x.r[1])} aria-invalid={x.error ? 'true' : undefined} aria-describedby={x.error ? `${id}-${x.k}-e` : undefined} hold={!!x.error} onChange={(e: any) => onTime(day.day, x.at, 1, +e.currentTarget.value)} />
                {day.ranges.length > 1 && <Button emphasis="ghost" tone="neutral" size="sm" icon={XIcon} label={`Remove ${name} range ${x.at + 1}`} onClick={() => onRemove(day.day, x.at)} />}
                {x.at === day.ranges.length - 1 && <Button emphasis="ghost" tone="neutral" size="sm" label={`Add a range on ${name}`} data-icon-only="" data-add={day.day} onClick={() => onAdd(day.day)}><PlusIcon /></Button>}
                {x.error && <span data-part="error" id={`${id}-${x.k}-e`}><AlertIcon /> {x.error}</span>}
              </div>
            ))
          : <span data-part="off">Unavailable</span>}
      </div>
    </li>
  )
}
