import { announce, applyPrefs, gridNav, prefCell, toggleChanges, triState, uid, type PrefChange, type PrefEvent, type PrefGroup, type PrefRules, type PrefValues } from '@weft-js/warp-core'
import { derived, onMount, state, untrack, watch } from '@weft-js/core'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Checkbox } from '../Choice'
import { Select } from '../Select'
import { use } from '@weft-js/warp-core/weft'
import { G, val } from './shared'
import '../fields'
import '@weft-js/warp-core/styles/app/prefs-matrix.css'

/** A column of the preferences grid: email, push and so on. */
export interface PrefChannel { id: string; label: string }
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

const DIGESTS = [{ value: 'instant', label: 'Instantly' }, { value: 'hourly', label: 'Hourly digest' }, { value: 'daily', label: 'Daily digest at 9:00' }, { value: 'weekly', label: 'Weekly digest, Mondays' }]
const lower = (s: string) => (s === 'SMS' ? s : s.toLowerCase())
type Save = 'idle' | 'saving' | 'saved' | 'error'
const CELL = 'input[type="checkbox"], [data-part="na"]'

/**
 * NotificationPreferences (07 §4.6): event × channel, one APG grid with one tab stop. Group and channel toggles are
 * tri-state; a required channel is locked and says why; a channel an event can't use is a plain "—" that still takes
 * focus. Saves on every change, optimistically; a rejected save flips back. The same DOM restacks below 560px.
 */
export function NotificationPreferences({ title = 'Notification preferences', groups, channels, value, offered, locked, lockReason = 'Required: this alert always goes to your account.', onChange, digest = 'instant', digestChannel = 'email', digests = DIGESTS, onDigest, defaults }: NotificationPreferencesProps) {
  const id = uid('prefs')
  const model = state<PrefValues>(untrack(() => val<PrefValues>(value)))
  const mail = state(untrack(() => digest))
  const save = state<Save>('idle')
  // what a cell is (a box, locked, not offered) never depends on the values: its node stays through every change
  const fixed: PrefRules = untrack(() => ({ offered, locked }))
  const events = derived(() => groups.flatMap(g => g.events))
  const reset = untrack(() => defaults)
  let grid: HTMLDivElement | undefined
  let seq = 0
  onMount(() => {
    watch(() => val<PrefValues>(value), v => { if (save.value !== 'saving') model.value = v })
    watch(() => digest, d => { if (save.value !== 'saving') mail.value = d })
  })
  use(gridNav, () => grid, () => ({ targets: CELL }))

  const say = (text: string, assertive = false) => announce(grid!.ownerDocument, text, assertive)
  /** Apply now, run the save, roll back on rejection. */
  const commit = async (apply: () => void, run: () => void | Promise<unknown>, msg: string) => {
    const snap = [model.value, mail.value] as const
    const mine = ++seq
    apply()
    save.value = 'saving'
    try {
      await run()
      if (mine !== seq) return
      save.value = 'saved'
      say(`${msg}. Saved.`)
    } catch {
      if (mine !== seq) return
      model.value = snap[0]
      mail.value = snap[1]
      save.value = 'error'
      say(`Couldn't save: ${msg}. Change undone.`, true)
    }
  }
  const change = (changes: PrefChange[], msg: string) => commit(() => (model.value = applyPrefs(model.value, changes)), () => onChange?.(changes), msg)
  const name = (c: string) => channels.find(x => x.id === c)!.label
  const cell = (e: PrefEvent, c: string, on: boolean) => change([{ event: e.id, channel: c, on }], `${e.label}, ${name(c)} ${on ? 'on' : 'off'}`)
  const parent = (evs: PrefEvent[], c: string, where?: string) => {
    const ch = toggleChanges(model.value, evs, fixed, c)
    if (ch.length) void change(ch, `${name(c)} ${ch[0]!.on ? 'on' : 'off'} for ${ch.length} event${ch.length > 1 ? 's' : ''}${where ? ` in ${where}` : ''}`)
  }
  const onLocked = (e: Event) => {
    e.preventDefault()
    grid!.querySelector<HTMLElement>(`#${(e.currentTarget as HTMLElement).id}`)?.focus()
    say(lockReason)
  }
  const onNa = (e: KeyboardEvent) => { if (e.key === ' ') { e.preventDefault(); say('Not offered for this event') } }

  const parentBox = (evs: PrefEvent[], c: string, nameText: string, visible: string, where: string | undefined, first: boolean) => {
    const tri = derived(() => triState(model.value, evs, fixed, c))
    return (
      <Checkbox checked={tri.value === 'on'} indeterminate={tri.value === 'mixed'} tabindex={first ? '0' : '-1'} onChange={() => parent(evs, c, where)}>
        <span data-part="sr-only">{nameText}</span><span data-part="ch-name" aria-hidden="true">{visible}</span>
      </Checkbox>
    )
  }
  const na = (text: string, chName?: string) => (
    <span data-part="na" tabindex="-1" onKeyDown={onNa}>
      <span aria-hidden="true">—</span><span data-part="sr-only">{text}</span>
      {chName && <span data-part="ch-name" aria-hidden="true">{chName}</span>}
    </span>
  )
  const emailOn = derived(() => events.value.some(e => prefCell(model.value, fixed, e.id, digestChannel) === 'on'))
  const hint = derived(() => (!emailOn.value ? 'Turn on an email event to choose a digest' : mail.value === 'instant' ? 'Each email is sent as it happens' : 'Batches email; security alerts skip the digest'))
  const statusText = derived(() => ({ idle: 'All changes saved', saving: 'Saving…', saved: 'Saved', error: "Couldn't save. Your last change was undone." })[save.value])
  const doReset = () => commit(() => { model.value = reset!.value; mail.value = reset!.digest ?? 'instant' }, async () => {
    await onChange?.(events.value.flatMap(e => channels.flatMap(c => (prefCell(reset!.value, fixed, e.id, c.id) === 'na' || prefCell(reset!.value, fixed, e.id, c.id) === 'locked' ? [] : [{ event: e.id, channel: c.id, on: !!reset!.value[e.id]?.[c.id] }]))))
    await onDigest?.(reset!.digest ?? 'instant')
  }, 'Notification settings reset to defaults')
  const pickDigest = (e: Event) => {
    const el = e.target as HTMLSelectElement
    const next = el.value
    void commit(() => (mail.value = next), () => onDigest?.(next), `Email delivery: ${el.selectedOptions[0]!.textContent}`)
  }

  return (
    <div data-scope="prefs-matrix">
      <span data-part="sr-only" id={`${id}-t`}>{title}</span>
      <div ref={n => (grid = n)} role="grid" data-part="grid" aria-labelledby={`${id}-t`} aria-describedby={`${id}-k`}>
        <div role="row" data-part="head">
          <div role="columnheader" data-part="corner">Event</div>
          {channels.map((c, i) => (
            <div key={c.id} role="columnheader">
              <span data-part="ch-head" aria-hidden="true">{c.label}</span>
              {parentBox(events.value, c.id, `${c.label}, all events`, `All ${lower(c.label)}`, undefined, i === 0)}
            </div>
          ))}
        </div>
        {groups.map(g => (
          <div key={g.id} role="rowgroup" data-part="rows">
            <div role="row" data-part="group">
              <div role="rowheader">{g.label}</div>
              {channels.map(c => (
                <div key={c.id} role="gridcell">
                  {triState({}, g.events, fixed, c.id) === null
                    ? na(`${g.label}, ${lower(c.label)}, not offered`)
                    : parentBox(g.events, c.id, `${g.label}, all ${lower(c.label)}`, c.label, g.label, false)}
                </div>
              ))}
            </div>
            {g.events.map(e => (
              <div key={e.id} role="row" data-row={e.id}>
                <div role="rowheader">
                  <b>{e.label}</b>
                  {e.hint && <small>{e.hint}</small>}
                  {e.instant && <Badge tone="info" hidden={mail.value === 'instant' || !emailOn.value}>Always instant</Badge>}
                </div>
                {channels.map(c => {
                  const kind = prefCell({}, fixed, e.id, c.id)
                  return (
                    <div key={c.id} role="gridcell">
                      {kind === 'na' ? na(`${e.label}, ${lower(c.label)}, not offered`, c.label)
                        : kind === 'locked' ? <Checkbox checked aria-disabled="true" aria-describedby={`${id}-lock`} tabindex="-1" id={`${id}-${e.id}-${c.id}`} onClick={onLocked}>
                            <span data-part="sr-only">{e.label}, {lower(c.label)}</span><span data-part="ch-name" aria-hidden="true">{c.label}</span><G name="lock" data-part="lock" />
                          </Checkbox>
                        : <EventCell on={prefCell(model.value, fixed, e.id, c.id) === 'on'} text={`${e.label}, ${lower(c.label)}`} ch={c.label} onToggle={(v: boolean) => cell(e, c.id, v)} />}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      <span data-part="sr-only" id={`${id}-k`}>Arrow keys move between cells, Home and End to the row's ends, Control Home and End to the grid's corners, Space toggles.</span>
      <span data-part="sr-only" id={`${id}-lock`}>{lockReason}</span>
      <div data-part="footer">
        <Select label="Email delivery" options={digests} value={mail.value} disabled={!emailOn.value} hint={hint.value} onChange={pickDigest} />
        <span data-part="status" role="status" data-state={save.value}>{statusText.value}</span>
        {reset && <Button emphasis="ghost" tone="neutral" size="sm" onClick={doReset}>Reset to defaults</Button>}
      </div>
    </div>
  )
}

function EventCell({ on, text, ch, onToggle }: { on: boolean; text: string; ch: string; onToggle: (v: boolean) => unknown }) {
  return (
    <Checkbox checked={on} tabindex="-1" onChange={(e: Event) => onToggle((e.target as HTMLInputElement).checked)}>
      <span data-part="sr-only">{text}</span><span data-part="ch-name" aria-hidden="true">{ch}</span>
    </Checkbox>
  )
}
