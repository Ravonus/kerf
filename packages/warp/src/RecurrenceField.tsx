import { addDays, fmt, formReset, occurrences, parseRule, ruleSentence, stringifyRule, weekOrder, weekdayName, weekdayOrdinal, DAYS, dow, ymd, type Frequency, type IsoDate, type Rule } from '@weft-js/warp-core'
import { derived, flush, state } from '@weft-js/core'
import { Chip } from './Chip'
import { DateField } from './DateField'
import { Textarea } from './Field'
import { NumberField } from './NumberField'
import { bindable, usePickerEnv, type Bindable } from './Picker'
import { use } from '@weft-js/warp-core/weft'
import '@weft-js/warp-core/styles/rich/recurrence.css'

const FREQS: Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
const titled = (s: string) => s[0] + s.slice(1).toLowerCase()

/** Chips as a radio group (one tab stop, arrows move and select, every chip has aria-checked). */
function ChipRadios<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  let box: HTMLDivElement | undefined
  const move = (e: KeyboardEvent) => {
    const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key]
    if (!d) return
    e.preventDefault()
    const at = options.findIndex(o => o.value === value)
    onChange(options[(at + d + options.length) % options.length]!.value)
    flush()
    box?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
  }
  return (
    <div ref={n => (box = n)} role="radiogroup" aria-label={label} class="chips" onKeyDown={move}>
      {options.map(o => <button key={o.value} type="button" data-scope="chip" role="radio" aria-checked={o.value === value ? 'true' : 'false'} tabindex={o.value === value ? '0' : '-1'} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

/** Props for RecurrenceField. */
export type RecurrenceFieldProps = Bindable<string | null> & {
  label: string
  dtstart: IsoDate
  preview?: number
  frequencies?: Frequency[]
  locale?: string | undefined
  name?: string | undefined
}

/**
 * RecurrenceField (04 §2): the summary leads and the controls sit below it. An RRULE with parts this field can't edit
 * is never rewritten: it becomes read-only "Custom rule" with the raw text and an Edit as text escape.
 */
export function RecurrenceField({ value, defaultValue, onValueChange, label, dtstart, preview = 5, frequencies = FREQS, locale, name }: RecurrenceFieldProps) {
  const env = usePickerEnv(() => locale, () => undefined)
  const v = bindable<string | null>(() => value, () => defaultValue, 'FREQ=WEEKLY', () => onValueChange)
  const rule = derived(() => parseRule(v.value))
  const asText = state(false)
  const custom = derived(() => rule.value.unknown.length > 0)
  const endMode = derived<'never' | 'count' | 'until'>(() => (rule.value.COUNT ? 'count' : rule.value.UNTIL ? 'until' : 'never'))
  const set = (patch: Partial<Rule>) => v.set(stringifyRule({ ...rule.value, ...patch }), 'pointer')
  const next = derived(() => occurrences(rule.value, dtstart, preview))
  const order = derived(() => weekOrder(env.locale.value))
  const monthly = derived(() => {
    const [, , d] = ymd(dtstart)
    const { nth, last } = weekdayOrdinal(dtstart)
    const day = DAYS[dow(dtstart)]!
    const dayName = weekdayName(day, env.locale.value)
    return [
      { value: 'day', label: `On day ${d}`, patch: { BYMONTHDAY: d, BYDAY: [] } },
      { value: 'nth', label: `On the ${['', 'first', 'second', 'third', 'fourth', 'fifth'][nth]} ${dayName}`, patch: { BYDAY: [`${nth}${day}`], BYMONTHDAY: null } },
      ...(last ? [{ value: 'last', label: `On the last ${dayName}`, patch: { BYDAY: [`-1${day}`], BYMONTHDAY: null } }] : []),
      { value: 'end', label: 'On the last day', patch: { BYMONTHDAY: -1, BYDAY: [] } },
    ]
  })
  const monthlyNow = derived(() => {
    const r = rule.value
    return r.BYMONTHDAY === -1 ? 'end' : r.BYDAY[0]?.startsWith('-1') ? 'last' : r.BYDAY.length ? 'nth' : 'day'
  })
  const toggleDay = (d: string) => {
    const on = rule.value.BYDAY
    set({ BYDAY: on.includes(d) ? (on.length > 1 ? on.filter(x => x !== d) : on) : [...on, d] })
  }
  const setEnd = (m: 'never' | 'count' | 'until') => set(m === 'count' ? { COUNT: 10, UNTIL: null } : m === 'until' ? { COUNT: null, UNTIL: addDays(dtstart, 60) } : { COUNT: null, UNTIL: null })
  let root: HTMLDivElement | undefined
  use(formReset, () => root, () => () => { v.reset(); asText.value = false })
  return (
    <div ref={n => (root = n)} role="group" aria-label={label} class="stack">
      {name && <input type="hidden" name={name} value={v.value ?? ''} />}
      {custom.value || asText.value ? (
        <>
          <p class="rr-sentence" aria-live="polite">Custom rule</p>
          {asText.value
            ? <Textarea label="RRULE" value={v.value ?? ''} onInput={e => v.set(e.currentTarget.value, 'keyboard')} />
            : <output class="readout"><span>RRULE</span><b>{v.value}</b></output>}
          <div class="chips"><button type="button" class="linkish" onClick={() => (asText.value = !asText.value)}>{asText.value ? 'Done' : 'Edit as text'}</button></div>
        </>
      ) : (
        <>
          <p class="rr-sentence" aria-live="polite">{ruleSentence(rule.value, dtstart, env.locale.value)}.</p>
          <div class="rr-grid">
            <div class="stack">
              <ChipRadios label="Frequency" value={rule.value.FREQ} options={frequencies.map(f => ({ value: f, label: titled(f) }))} onChange={f => set({ FREQ: f, BYDAY: f === 'WEEKLY' ? rule.value.BYDAY : [], BYMONTHDAY: null })} />
              <NumberField label="Every (interval)" min={1} max={99} value={rule.value.INTERVAL} onValueChange={n => set({ INTERVAL: n ?? 1 })} />
              {rule.value.FREQ === 'WEEKLY' && (
                <div role="group" aria-label="On these days" class="chips">
                  {order.value.map(d => <Chip key={d} data-day={d} pressed={rule.value.BYDAY.includes(d)} onClick={() => toggleDay(d)}><span aria-hidden="true">{weekdayName(d, env.locale.value, 'short')}</span><span class="sr">{weekdayName(d, env.locale.value)}</span></Chip>)}
                </div>
              )}
              {rule.value.FREQ === 'MONTHLY' && <ChipRadios label="On" value={monthlyNow.value} options={monthly.value} onChange={m => set(monthly.value.find(o => o.value === m)!.patch)} />}
              <ChipRadios label="Ends" value={endMode.value} options={[{ value: 'never', label: 'Never ends' }, { value: 'count', label: 'After…' }, { value: 'until', label: 'On date…' }]} onChange={setEnd} />
              {endMode.value === 'count' && <NumberField label="Occurrences" min={1} max={999} value={rule.value.COUNT} onValueChange={n => set({ COUNT: n ?? 1 })} />}
              {endMode.value === 'until' && <DateField label="Last date" value={rule.value.UNTIL ?? null} onValueChange={d => { if (d) set({ UNTIL: d }) }} />}
            </div>
            <div class="stack">
              <p class="dt-cap">Next {preview}</p>
              <ol class="rr-next">
                {next.value.map(d => <li key={d}>{fmt(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, env.locale.value)}</li>)}
                {!next.value.length && <li>No occurrences.</li>}
              </ol>
              <details>
                <summary>Advanced</summary>
                <output class="readout"><span>RRULE</span><b>{v.value}</b></output>
                <button type="button" class="linkish" onClick={() => (asText.value = true)}>Edit as text</button>
              </details>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

