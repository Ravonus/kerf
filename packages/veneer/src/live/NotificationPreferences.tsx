import { type PrefChange, type PrefGroup, type PrefValues } from '@kerf/veneer-core'
import { Button } from '../Button'
import { Select } from '../Select'
import { preferencesModel } from './NotificationPreferencesModel'
import { PreferencesHead, PreferencesGroup } from './NotificationPreferencesGrid'
import '../fields'
import '@kerf/veneer-core/styles/app/prefs-matrix.css'

/** A column of the preferences grid: email, push and so on. */
export interface PrefChannel {
  id: string
  label: string
}
/** Props for NotificationPreferences. */
export interface NotificationPreferencesProps {
  /** The grid's name: the id of a heading, else this text is rendered in a visually hidden one. */
  title?: string
  groups: PrefGroup[]
  channels: PrefChannel[]
  value: PrefValues | { value: PrefValues } | (() => PrefValues)
  /** Event id → the channels it can use. An event not listed can use all. */
  offered?: Record<string, string[]> | undefined
  /** Event id → the channels it must use. */
  locked?: Record<string, string[]> | undefined
  lockReason?: string
  /** Every change saves on its own; a rejected promise flips the cells back and says why. */
  onChange?: ((changes: PrefChange[]) => void | Promise<unknown>) | undefined
  digest?: string
  /** The channel the digest applies to. */
  digestChannel?: string
  /** The email delivery choices, such as instant, hourly or daily. */
  digests?: { value: string; label: string }[]
  /** Called with the delivery picked. A rejected promise puts the old one back. */
  onDigest?: (digest: string) => void | Promise<unknown>
  /** Enables Reset to defaults. */
  defaults?: { value: PrefValues; digest?: string }
}

const DIGESTS = [
  { value: 'instant', label: 'Instantly' },
  { value: 'hourly', label: 'Hourly digest' },
  { value: 'daily', label: 'Daily digest at 9:00' },
  { value: 'weekly', label: 'Weekly digest, Mondays' },
]

/**
 * NotificationPreferences (07 §4.6): event × channel, one APG grid with one tab stop. Group and channel toggles are
 * tri-state; a required channel is locked and says why; a channel an event can't use is a plain "—" that still takes
 * focus. Saves on every change, optimistically; a rejected save flips back. The same DOM restacks below 560px.
 */
export function NotificationPreferences(props: NotificationPreferencesProps) {
  const state = preferencesModel(() => props)
  return (
    <div data-scope="prefs-matrix">
      <span data-part="sr-only" id={`${state.id}-t`}>
        {props.title === undefined ? 'Notification preferences' : props.title}
      </span>
      <div
        ref={state.setGrid}
        role="grid"
        data-part="grid"
        aria-labelledby={`${state.id}-t`}
        aria-describedby={`${state.id}-k`}
      >
        <PreferencesHead channels={props.channels} state={state} />
        {props.groups.map((g) => (
          <PreferencesGroup key={g.id} g={g} channels={props.channels} state={state} />
        ))}
      </div>
      <span data-part="sr-only" id={`${state.id}-k`}>
        Arrow keys move between cells, Home and End to the row's ends, Control Home and End to the
        grid's corners, Space toggles.
      </span>
      <span data-part="sr-only" id={`${state.id}-lock`}>
        {props.lockReason === undefined
          ? 'Required: this alert always goes to your account.'
          : props.lockReason}
      </span>
      <div data-part="footer">
        <Select
          label="Email delivery"
          options={props.digests === undefined ? DIGESTS : props.digests}
          value={state.mail.value}
          disabled={!state.emailOn.value}
          hint={state.hint.value}
          onChange={state.pickDigest}
        />
        <span data-part="status" role="status" data-state={state.save.value}>
          {state.statusText.value}
        </span>
        {state.reset && (
          <Button emphasis="ghost" tone="neutral" size="sm" onClick={state.doReset}>
            Reset to defaults
          </Button>
        )}
      </div>
    </div>
  )
}
