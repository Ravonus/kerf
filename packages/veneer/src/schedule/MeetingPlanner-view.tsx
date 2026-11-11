import { ClockIcon, SendIcon, XIcon } from '@kerf/veneer-icons'
import { asTime, fmt, zoneCity, type Attendee, type Range } from '@kerf/veneer-core'
import { untrack, type State } from '@kerf/core'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Card } from '../Card'
import { ComboField } from '../Combobox'
import { Input } from '../Field'
import { Avatar } from '../parts'
import { TimeField } from '../TimeField'
import { SweepParts } from './bits'
import type { MeetingPlannerProps } from './MeetingPlanner'
import type { plannerInputs, plannerComputed, peopleActions } from './MeetingPlanner-model'

type View = ReturnType<typeof plannerInputs> &
  ReturnType<typeof plannerComputed> &
  ReturnType<typeof peopleActions> & {
    p: MeetingPlannerProps
    id: string
    env: { locale: State<string> }
    setGroup: (el: HTMLDivElement) => void
    onRadio: (event: KeyboardEvent) => void
    send: () => Promise<void>
  }

const BUSY_BAR =
  'position:absolute;inset-block:7px;border-radius:3px;background:color-mix(in oklab,var(--veneer-color-text) 22%,transparent)'
const FREE_BAR =
  'position:absolute;inset-block:6px;background:var(--veneer-color-positive-soft);border-block:1px solid var(--veneer-color-positive-border)'
const PICK_BAR =
  'position:absolute;inset-block:0;background:color-mix(in oklab,var(--veneer-color-sweep) 18%,transparent);border-inline:var(--veneer-border-emphasis) solid var(--veneer-color-sweep)'

function attendeesCard({ p, query, id, people, add, drop }: View) {
  return (
    <Card sweep={false}>
      <div class="stack">
        <h4 id={`${id}-att`}>
          Attendees <span class="muted">{people.value.length}</span>
        </h4>
        {p.loadAttendees && (
          <ComboField
            label="Add people"
            text={() => query.value}
            onText={(t) => (query.value = t)}
            find={p.loadAttendees}
            row={(a: Attendee) => ({ main: a.name, sub: a.zone && zoneCity(a.zone) })}
            onPick={add}
          />
        )}
        <ul class="stack" aria-labelledby={`${id}-att`}>
          {people.value.map((a) => (
            <li key={a.id} class="row">
              <Avatar name={a.name} size="sm" />
              <span>
                {a.name}
                {a.organizer && <span class="muted"> (organizer)</span>}
              </span>
              <span style="flex:1"></span>
              <span class="muted">{a.zone ? zoneCity(a.zone) : ''}</span>
              {!a.organizer && (
                <Button
                  emphasis="ghost"
                  tone="neutral"
                  size="sm"
                  icon={XIcon}
                  label={`Remove ${a.name}`}
                  onClick={() => drop(a)}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function detailsCard({ title, link, p }: View) {
  return (
    <Card sweep={false}>
      <div class="stack">
        <h4>Details</h4>
        <Input
          label="Title"
          value={title.value}
          onInput={(e) => (title.value = e.currentTarget.value)}
        />
        <Input
          label="Video link"
          value={link.value}
          onInput={(e) => (link.value = e.currentTarget.value)}
        />
        {p.tags && (
          <div class="row">
            {p.tags.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export function peopleLanes({ people, span, ticks, left, size, chosen, len }: View) {
  return (
    <>
      {people.value.map((a) => (
        <div key={a.id} role="row">
          <div data-part="lane-label" role="rowheader">
            <Avatar name={a.name} size="sm" />
            <span>{a.name.split(' ')[0]}</span>
          </div>
          <div data-part="lane" role="cell" style={`--_slots:${ticks.value.length}`}>
            <span class="sr">
              {(a.busy ?? []).length
                ? `Busy ${(a.busy as Range[]).map((r) => span(r[0], r[1])).join(', ')}`
                : 'Free all day'}
            </span>
            {(a.busy ?? []).map((r) => (
              <span
                key={r[0]}
                aria-hidden="true"
                style={`${BUSY_BAR};inset-inline-start:${left(r[0])}%;inline-size:${size(r[1] - r[0])}%`}
              ></span>
            ))}
            {chosen.value !== null && (
              <span
                aria-hidden="true"
                style={`${PICK_BAR};inset-inline-start:${left(chosen.value)}%;inline-size:${size(len.value)}%`}
              ></span>
            )}
          </div>
        </div>
      ))}
    </>
  )
}

export function TimelineCard({ view }: { view: View }) {
  const src = untrack(() => view)
  const { p, id, env, ticks, time, shared, span, left, size } = src
  return (
    <Card sweep={false}>
      <div class="stack">
        <h4 id={`${id}-grid`}>
          {fmt(p.date, { weekday: 'long', month: 'short', day: 'numeric' }, env.locale.value)}{' '}
          {p.timeZone && <span class="muted">· {zoneCity(p.timeZone)}</span>}
        </h4>
        <div data-scope="calendar">
          <div data-part="timeline" role="table" aria-labelledby={`${id}-grid`}>
            <span aria-hidden="true"></span>
            <div
              class="muted"
              aria-hidden="true"
              style={`display:grid;grid-template-columns:repeat(${ticks.value.length},1fr)`}
            >
              {ticks.value.map((m, n) => (
                <span key={m}>{n % 2 ? '' : time(m)}</span>
              ))}
            </div>
            {peopleLanes(src)}
            <div role="row">
              <div data-part="lane-label" role="rowheader">
                Everyone
              </div>
              <div data-part="lane" role="cell" style={`--_slots:${ticks.value.length}`}>
                <span class="sr">
                  Everyone free:{' '}
                  {shared.value.map((r) => span(r[0], r[1])).join(', ') || 'no shared time'}
                </span>
                {shared.value.map((r) => (
                  <span
                    key={r[0]}
                    aria-hidden="true"
                    style={`${FREE_BAR};inset-inline-start:${left(r[0])}%;inline-size:${size(r[1] - r[0])}%`}
                  ></span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

export function sentView({ summary, people, p, sent }: View) {
  return (
    <div data-arrive="" data-sweep="" class="row" role="status">
      <div>
        <b>Invite sent · {summary.value}</b>
        <p class="muted">
          {people.value.length} people · added to your calendar · we'll tell you when they answer.
        </p>
      </div>
      {p.onUndo && (
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          onClick={() => {
            sent.value = false
            p.onUndo?.()
          }}
        >
          Undo
        </Button>
      )}
    </div>
  )
}

function slotPicker({ setGroup, id, onRadio, slots, chosen, pick, time }: View) {
  return (
    <div data-scope="booking" data-part="root">
      <div
        ref={(n) => setGroup(n)}
        data-part="slots"
        role="radiogroup"
        aria-labelledby={`${id}-slots`}
        onKeyDown={onRadio}
      >
        {slots.value.map((m) => (
          <button
            key={m}
            type="button"
            data-part="slot"
            data-sweep=""
            role="radio"
            aria-checked={m === chosen.value ? 'true' : 'false'}
            data-hold={m === chosen.value ? '' : undefined}
            tabindex={m === chosen.value ? '0' : '-1'}
            onClick={() => (pick.value = m)}
          >
            <SweepParts />
            {time(m)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function inviteForm(view: View) {
  const { id, slots, fit, people, failed, manual, typed, env } = view
  const { summary, elsewhere, chosen, busy, send } = view
  return (
    <div class="stack">
      <div class="row">
        <h4 id={`${id}-slots`}>Suggested times</h4>
        <span style="flex:1"></span>
        <span class="muted">
          {slots.value.length
            ? `Everyone is free · within working hours for ${fit.value} of ${people.value.length}`
            : 'No time works for everyone'}
        </span>
      </div>
      {manual.value ? (
        <TimeField label="Start" value={typed} locale={env.locale.value} hourCycle="h23" />
      ) : (
        slotPicker(view)
      )}
      <div class="row">
        <span>
          <b>{summary.value}</b>{' '}
          {elsewhere.value.length > 0 && <span class="muted">· {elsewhere.value.join(' · ')}</span>}
        </span>
        <span style="flex:1"></span>
        <Button
          emphasis="outline"
          tone="neutral"
          size="sm"
          icon={ClockIcon}
          onClick={() => {
            typed.value = chosen.value !== null ? asTime(chosen.value) : null
            manual.value = !manual.value
          }}
        >
          {manual.value ? 'Suggested times' : 'Pick manually'}
        </Button>
        <Button loading={busy.value} disabled={chosen.value === null} onClick={send}>
          <SendIcon />
          Send invite
        </Button>
      </div>
      {failed.value && (
        <p role="alert" class="muted">
          Couldn't send the invite: {failed.value}
        </p>
      )}
    </div>
  )
}

export function InviteCard({ view }: { view: View }) {
  const src = untrack(() => view)
  const { sent } = src
  return <Card sweep={false}>{sent.value ? sentView(src) : inviteForm(src)}</Card>
}

export function AttendeesCard({ view }: { view: View }) {
  return attendeesCard(untrack(() => view))
}

export function DetailsCard({ view }: { view: View }) {
  return detailsCard(untrack(() => view))
}
