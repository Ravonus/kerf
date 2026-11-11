import {
  announce,
  applyPrefs,
  toggleChanges,
  type PrefChange,
  type PrefEvent,
  type PrefRules,
  type PrefValues,
} from '@kerf/veneer-core'
import type { State } from '@kerf/core'
import type { Inputs, Save } from './NotificationPreferencesModel'

export function preferencesSave({
  p,
  model,
  mail,
  save,
  fixed,
  grid,
}: {
  p: () => Inputs
  model: State<PrefValues>
  mail: State<string>
  save: State<Save>
  fixed: PrefRules
  grid: () => HTMLDivElement | undefined
}) {
  let seq = 0
  const say = (text: string, assertive = false) => announce(grid()!.ownerDocument, text, assertive)
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
  const change = (changes: PrefChange[], msg: string) =>
    commit(
      () => (model.value = applyPrefs(model.value, changes)),
      () => p().onChange?.(changes),
      msg,
    )
  const name = (c: string) => p().channels.find((x) => x.id === c)!.label
  const cell = (e: PrefEvent, c: string, on: boolean) =>
    change([{ event: e.id, channel: c, on }], `${e.label}, ${name(c)} ${on ? 'on' : 'off'}`)
  const parent = (evs: PrefEvent[], c: string, where?: string) => {
    const ch = toggleChanges(model.value, evs, fixed, c)
    if (ch.length)
      void change(
        ch,
        `${name(c)} ${ch[0]!.on ? 'on' : 'off'} for ${ch.length} event${ch.length > 1 ? 's' : ''}${where ? ` in ${where}` : ''}`,
      )
  }
  const onLocked = (e: Event) => {
    e.preventDefault()
    grid()!
      .querySelector<HTMLElement>(`#${(e.currentTarget as HTMLElement).id}`)
      ?.focus()
    say(
      p().lockReason === undefined
        ? 'Required: this alert always goes to your account.'
        : p().lockReason!,
    )
  }
  const onNa = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault()
      say('Not offered for this event')
    }
  }

  return { commit, cell, parent, onLocked, onNa }
}
