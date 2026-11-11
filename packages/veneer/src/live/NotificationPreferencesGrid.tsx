import { prefCell, triState, type PrefGroup, type PrefEvent } from '@kerf/veneer-core'
import { Badge } from '../Badge'
import { Checkbox } from '../Choice'
import { G } from './shared'
import { EventCell } from './NotificationPreferencesCell'
import type { PrefChannel } from './NotificationPreferences'
import type { preferencesModel } from './NotificationPreferencesModel'

const lower = (s: string) => (s === 'SMS' ? s : s.toLowerCase())

type Model = ReturnType<typeof preferencesModel>

export function PreferencesHead({ channels, state }: { channels: PrefChannel[]; state: Model }) {
  return (
    <div role="row" data-part="head">
      <div role="columnheader" data-part="corner">
        Event
      </div>
      {channels.map((c, i) => (
        <div key={c.id} role="columnheader">
          <span data-part="ch-head" aria-hidden="true">
            {c.label}
          </span>
          {state.parentBox({
            evs: state.events.value,
            c: c.id,
            nameText: `${c.label}, all events`,
            visible: `All ${lower(c.label)}`,
            where: undefined,
            first: i === 0,
          })}
        </div>
      ))}
    </div>
  )
}

export function PreferencesGroup({
  g,
  channels,
  state,
}: {
  g: PrefGroup
  channels: PrefChannel[]
  state: Model
}) {
  return (
    <div role="rowgroup" data-part="rows">
      <div role="row" data-part="group">
        <div role="rowheader">{g.label}</div>
        {channels.map((c) => (
          <div key={c.id} role="gridcell">
            {triState({}, g.events, state.fixed, c.id) === null
              ? state.na(`${g.label}, ${lower(c.label)}, not offered`)
              : state.parentBox({
                  evs: g.events,
                  c: c.id,
                  nameText: `${g.label}, all ${lower(c.label)}`,
                  visible: c.label,
                  where: g.label,
                  first: false,
                })}
          </div>
        ))}
      </div>
      {g.events.map((e) => (
        <PreferencesEvent key={e.id} e={e} channels={channels} state={state} />
      ))}
    </div>
  )
}

function PreferencesEvent({
  e,
  channels,
  state,
}: {
  e: PrefEvent
  channels: PrefChannel[]
  state: Model
}) {
  return (
    <div role="row" data-row={e.id}>
      <div role="rowheader">
        <b>{e.label}</b>
        {e.hint && <small>{e.hint}</small>}
        {e.instant && (
          <Badge tone="info" hidden={state.mail.value === 'instant' || !state.emailOn.value}>
            Always instant
          </Badge>
        )}
      </div>
      {channels.map((c) => {
        const kind = prefCell({}, state.fixed, e.id, c.id)
        return (
          <div key={c.id} role="gridcell">
            {kind === 'na' ? (
              state.na(`${e.label}, ${lower(c.label)}, not offered`, c.label)
            ) : kind === 'locked' ? (
              <Checkbox
                checked
                aria-disabled="true"
                aria-describedby={`${state.id}-lock`}
                tabindex="-1"
                id={`${state.id}-${e.id}-${c.id}`}
                onClick={state.onLocked}
              >
                <span data-part="sr-only">
                  {e.label}, {lower(c.label)}
                </span>
                <span data-part="ch-name" aria-hidden="true">
                  {c.label}
                </span>
                <G name="lock" data-part="lock" />
              </Checkbox>
            ) : (
              <EventCell
                on={prefCell(state.model.value, state.fixed, e.id, c.id) === 'on'}
                text={`${e.label}, ${lower(c.label)}`}
                ch={c.label}
                onToggle={(v: boolean) => state.cell(e, c.id, v)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
