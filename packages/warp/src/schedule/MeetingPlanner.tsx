import { announce, asTime, clock, clockRange, fmt, minutes, sharedFree, suggestSlots, uid, withinHours, zoneCity, zoneMinute, type Attendee, type IsoTime, type Range } from '@weft/ui-core'
import { derived, flush, state, untrack, watch } from 'weft'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Card } from '../Card'
import { Segmented } from '../Choice'
import { ComboField } from '../Combobox'
import { Input } from '../Field'
import { Avatar, Glyph } from '../parts'
import { usePickerEnv } from '../Picker'
import { TimeField } from '../TimeField'
import { PATHS, SweepParts, confirmSweep } from './bits'
import '@weft/ui-core/styles/app/booking.css'
import '@weft/ui-core/styles/app/calendar.css'

export type MeetingDetails = { attendees: Attendee[]; title: string; link: string; tags: string[]; date: string; s: number; e: number }
export type MeetingPlannerProps = {
  date: string
  attendees?: Attendee[]
  /** Search for people to add. */
  loadAttendees?: (q: string, signal: AbortSignal) => Promise<Attendee[]>
  /** The app's own suggestions; else they come from everyone's `busy`. */
  loadSlots?: (input: { attendees: Attendee[]; date: string; duration: number }) => number[] | Promise<number[]>
  duration?: number
  durations?: number[]
  title?: string
  link?: string
  tags?: string[]
  /** The strip's hours, minutes since midnight. */
  from?: number
  to?: number
  timeZone?: string
  today?: string
  locale?: string
  hourCycle?: string
  onSubmit: (m: MeetingDetails) => void | Promise<unknown>
  onUndo?: () => void
}

const BUSY_BAR = 'position:absolute;inset-block:7px;border-radius:3px;background:color-mix(in oklab,var(--warp-color-text) 22%,transparent)'
const FREE_BAR = 'position:absolute;inset-block:6px;background:var(--warp-color-positive-soft);border-block:1px solid var(--warp-color-positive-border)'
const PICK_BAR = 'position:absolute;inset-block:0;background:color-mix(in oklab,var(--warp-color-sweep) 18%,transparent);border-inline:var(--warp-border-emphasis) solid var(--warp-color-sweep)'

/**
 * MeetingPlanner (07 §2.2, `#planner`): attendees, details, an availability table with an Everyone row, three suggested
 * times as a radiogroup, a manual time, Send. Everything is drawn from `busy`, so it works from a query or a signal.
 */
export function MeetingPlanner(p: MeetingPlannerProps) {
  const id = uid('plan')
  const env = usePickerEnv(() => p.locale, () => p.today)
  const people = state<Attendee[]>(untrack(() => p.attendees ?? []))
  const len = state(untrack(() => p.duration ?? 30))
  const lens = derived(() => (p.durations ?? [15, 30, 45, 60]).map(m => ({ value: String(m), label: `${m} min` })))
  const title = state(untrack(() => p.title ?? ''))
  const link = state(untrack(() => p.link ?? ''))
  const query = state('')
  const manual = state(false)
  const typed = state<IsoTime | null>(null)
  const sent = state(false)
  const busy = state(false)
  const failed = state<string | null>(null)
  const remote = state<number[] | null>(null)
  const from = derived(() => p.from ?? 480)
  const to = derived(() => p.to ?? 1080)
  const width = derived(() => to.value - from.value)
  const ticks = derived(() => Array.from({ length: Math.round(width.value / 60) }, (_, i) => from.value + i * 60))
  const busyLists = derived(() => people.value.map(a => a.busy ?? []))
  const slots = derived(() => remote.value ?? suggestSlots(people.value, p.date, { len: len.value, from: from.value, to: to.value, zone: p.timeZone }))
  const shared = derived(() => sharedFree(busyLists.value, from.value, to.value))
  const pick = state<number | null>(null)
  const chosen = derived(() => (manual.value ? (typed.value ? minutes(typed.value) : null) : pick.value !== null && slots.value.includes(pick.value) ? pick.value : slots.value[0] ?? null))
  const time = (m: number) => clock(m, env.locale.value, p.hourCycle)
  const span = (a: number, b: number) => clockRange(a, b, env.locale.value, p.hourCycle)
  const left = (m: number) => ((m - from.value) / width.value) * 100
  const size = (m: number) => (m / width.value) * 100
  let root: HTMLDivElement | undefined
  let group: HTMLDivElement | undefined
  const say = (t: string, loud = false) => root && announce(root.ownerDocument, t, loud)
  watch(() => [people.value, len.value] as const, ([a, l]) => {
    if (!p.loadSlots) return
    const r = p.loadSlots({ attendees: a, date: p.date, duration: l })
    if (Array.isArray(r)) remote.value = r
    else r.then(v => (remote.value = v))
  })
  const fit = derived(() => { const s = chosen.value; return s === null ? 0 : withinHours(people.value, p.date, s, len.value, p.timeZone) })
  const elsewhere = derived(() => { const s = chosen.value; if (s === null) return []; return [...new Set(people.value.map(a => a.zone).filter(z => z && z !== p.timeZone))].slice(0, 2).map(z => `${zoneCity(z!)} ${time(zoneMinute(p.date, s, p.timeZone, z))}`) })
  const summary = derived(() => (chosen.value === null ? 'No common time today' : `${fmt(p.date, { weekday: 'short', month: 'short', day: 'numeric' }, env.locale.value)} · ${span(chosen.value, chosen.value + len.value)}`))
  const add = (a: Attendee) => {
    if (!people.value.some(x => x.id === a.id)) people.value = [...people.value, a]
    query.value = ''
    say(`${a.name} added. ${slots.value.length} times work for everyone.`)
  }
  const drop = (a: Attendee) => { people.value = people.value.filter(x => x.id !== a.id); say(`${a.name} removed`) }
  const setLen = (v: string) => { len.value = +v; flush(); say(`${v} minutes. ${slots.value.length} times work for everyone.`) }
  const onRadio = (e: KeyboardEvent) => {
    const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key]
    const list = slots.value
    const i = list.indexOf(chosen.value!)
    const n = d ? (i + d + list.length) % list.length : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : -1
    if (n < 0) return
    e.preventDefault()
    pick.value = list[n]
    flush()
    group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
  }
  const send = async () => {
    const s = chosen.value
    if (s === null || busy.value) return
    busy.value = true
    failed.value = null
    try {
      await p.onSubmit({ attendees: people.value, title: title.value, link: link.value, tags: p.tags ?? [], date: p.date, s, e: s + len.value })
      sent.value = true
      say(`Invite sent for ${summary.value}`)
      flush()
      confirmSweep(root?.querySelector('[data-arrive]'))
    } catch (err: any) {
      failed.value = err?.message ?? 'Try again.'
      say(`Couldn't send the invite: ${failed.value}`, true)
    } finally { busy.value = false }
  }
  return (
    <div ref={(n: any) => (root = n)} class="stack">
      <div class="row">
        <div><span data-part="eyebrow">MeetingPlanner</span><h3>Find a time</h3></div>
        <span style="flex:1"></span>
        <Segmented label="Duration" size="sm" value={String(len.value)} onChange={setLen} options={lens.value} />
      </div>
      <Card sweep={false}>
        <div class="stack">
          <h4 id={`${id}-att`}>Attendees <span class="muted">{people.value.length}</span></h4>
          {p.loadAttendees && <ComboField label="Add people" text={() => query.value} onText={t => (query.value = t)} find={p.loadAttendees} row={(a: Attendee) => ({ main: a.name, sub: a.zone && zoneCity(a.zone) })} onPick={add} />}
          <ul class="stack" aria-labelledby={`${id}-att`}>
            {people.value.map(a => (
              <li key={a.id} class="row">
                <Avatar name={a.name} size="sm" />
                <span>{a.name}{a.organizer && <span class="muted"> (organizer)</span>}</span>
                <span style="flex:1"></span>
                <span class="muted">{a.zone ? zoneCity(a.zone) : ''}</span>
                {!a.organizer && <Button emphasis="ghost" tone="neutral" size="sm" icon="x" label={`Remove ${a.name}`} onClick={() => drop(a)} />}
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <Card sweep={false}>
        <div class="stack">
          <h4>Details</h4>
          <Input label="Title" value={title.value} onInput={e => (title.value = e.currentTarget.value)} />
          <Input label="Video link" value={link.value} onInput={e => (link.value = e.currentTarget.value)} />
          {p.tags && <div class="row">{p.tags.map(t => <Badge key={t} tone="neutral">{t}</Badge>)}</div>}
        </div>
      </Card>
      <Card sweep={false}>
        <div class="stack">
          <h4 id={`${id}-grid`}>{fmt(p.date, { weekday: 'long', month: 'short', day: 'numeric' }, env.locale.value)} {p.timeZone && <span class="muted">· {zoneCity(p.timeZone)}</span>}</h4>
          <div data-scope="calendar">
            <div data-part="timeline" role="table" aria-labelledby={`${id}-grid`}>
              <span aria-hidden="true"></span>
              <div class="muted" aria-hidden="true" style={`display:grid;grid-template-columns:repeat(${ticks.value.length},1fr)`}>{ticks.value.map((m, n) => <span key={m}>{n % 2 ? '' : time(m)}</span>)}</div>
              {people.value.map(a => (
                <div key={a.id} role="row">
                  <div data-part="lane-label" role="rowheader"><Avatar name={a.name} size="sm" /><span>{a.name.split(' ')[0]}</span></div>
                  <div data-part="lane" role="cell" style={`--_slots:${ticks.value.length}`}>
                    <span class="sr">{(a.busy ?? []).length ? `Busy ${(a.busy as Range[]).map(r => span(r[0], r[1])).join(', ')}` : 'Free all day'}</span>
                    {(a.busy ?? []).map(r => <span key={r[0]} aria-hidden="true" style={`${BUSY_BAR};inset-inline-start:${left(r[0])}%;inline-size:${size(r[1] - r[0])}%`}></span>)}
                    {chosen.value !== null && <span aria-hidden="true" style={`${PICK_BAR};inset-inline-start:${left(chosen.value)}%;inline-size:${size(len.value)}%`}></span>}
                  </div>
                </div>
              ))}
              <div role="row">
                <div data-part="lane-label" role="rowheader">Everyone</div>
                <div data-part="lane" role="cell" style={`--_slots:${ticks.value.length}`}>
                  <span class="sr">Everyone free: {shared.value.map(r => span(r[0], r[1])).join(', ') || 'no shared time'}</span>
                  {shared.value.map(r => <span key={r[0]} aria-hidden="true" style={`${FREE_BAR};inset-inline-start:${left(r[0])}%;inline-size:${size(r[1] - r[0])}%`}></span>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
      <Card sweep={false}>
        {sent.value
          ? <div data-arrive="" data-sweep="" data-phase="idle" class="row" role="status"><div><b>Invite sent · {summary.value}</b><p class="muted">{people.value.length} people · added to your calendar · we'll tell you when they answer.</p></div>{p.onUndo && <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => { sent.value = false; p.onUndo?.() }}>Undo</Button>}</div>
          : <div class="stack">
              <div class="row"><h4 id={`${id}-slots`}>Suggested times</h4><span style="flex:1"></span><span class="muted">{slots.value.length ? `Everyone is free · within working hours for ${fit.value} of ${people.value.length}` : 'No time works for everyone'}</span></div>
              {manual.value
                ? <TimeField label="Start" value={typed} locale={env.locale.value} hourCycle="h23" />
                : <div data-scope="booking" data-part="root">
                    <div ref={(n: any) => (group = n)} data-part="slots" role="radiogroup" aria-labelledby={`${id}-slots`} onKeyDown={onRadio}>
                      {slots.value.map(m => <button key={m} type="button" data-part="slot" data-sweep="" data-phase="idle" role="radio" aria-checked={m === chosen.value ? 'true' : 'false'} data-hold={m === chosen.value ? '' : undefined} tabindex={m === chosen.value ? '0' : '-1'} onClick={() => (pick.value = m)}><SweepParts />{time(m)}</button>)}
                    </div>
                  </div>}
              <div class="row">
                <span><b>{summary.value}</b> {elsewhere.value.length > 0 && <span class="muted">· {elsewhere.value.join(' · ')}</span>}</span>
                <span style="flex:1"></span>
                <Button emphasis="outline" tone="neutral" size="sm" icon="clock" onClick={() => { typed.value = chosen.value !== null ? asTime(chosen.value) : null; manual.value = !manual.value }}>{manual.value ? 'Suggested times' : 'Pick manually'}</Button>
                <Button loading={busy.value} disabled={chosen.value === null} onClick={send}><Glyph d={PATHS.send} />Send invite</Button>
              </div>
              {failed.value && <p role="alert" class="muted">Couldn't send the invite: {failed.value}</p>}
            </div>}
      </Card>
    </div>
  )
}
