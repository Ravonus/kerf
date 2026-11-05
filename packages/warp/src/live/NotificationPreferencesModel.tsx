import { prefCell, uid, type PrefRules, type PrefValues } from '@weft-js/warp-core'
import { derived, state, untrack } from '@weft-js/core'
import { val } from './shared'
import { preferencesWatch } from './NotificationPreferencesWatch'
import { preferencesSave } from './NotificationPreferencesSave'
import { preferencesCells } from './NotificationPreferencesCells'
import { preferencesActions } from './NotificationPreferencesActions'
import type { NotificationPreferencesProps } from './NotificationPreferences'

export type Inputs = {
  [K in keyof NotificationPreferencesProps]-?: NotificationPreferencesProps[K] | undefined
} & Pick<NotificationPreferencesProps, 'groups' | 'channels' | 'value'> & {
    title: string
    lockReason: string
    digest: string
    digestChannel: string
    digests: { value: string; label: string }[]
  }
export type Save = 'idle' | 'saving' | 'saved' | 'error'

export function preferencesModel(p: () => Inputs) {
  const id = uid('prefs')
  const model = state<PrefValues>(untrack(() => val<PrefValues>(p().value)))
  const mail = state(untrack(() => p().digest))
  const save = state<Save>('idle')
  // what a cell is (a box, locked, not offered) never depends on the values: its node stays through every change
  const fixed: PrefRules = untrack(() => ({ offered: p().offered, locked: p().locked }))
  const events = derived(() => p().groups.flatMap((g) => g.events))
  const reset = untrack(() => p().defaults)
  let grid: HTMLDivElement | undefined
  preferencesWatch(p, model, mail, save, () => grid)

  const { commit, cell, parent, onLocked, onNa } = preferencesSave(
    p,
    model,
    mail,
    save,
    fixed,
    () => grid,
  )

  const { parentBox, na } = preferencesCells(model, fixed, parent, onNa)
  const emailOn = derived(() =>
    events.value.some((e) => prefCell(model.value, fixed, e.id, p().digestChannel) === 'on'),
  )
  const hint = derived(() =>
    !emailOn.value
      ? 'Turn on an email event to choose a digest'
      : mail.value === 'instant'
        ? 'Each email is sent as it happens'
        : 'Batches email; security alerts skip the digest',
  )
  const statusText = derived(
    () =>
      ({
        idle: 'All changes saved',
        saving: 'Saving…',
        saved: 'Saved',
        error: "Couldn't save. Your last change was undone.",
      })[save.value],
  )
  const { doReset, pickDigest } = preferencesActions(p, model, mail, events, reset, fixed, commit)

  return {
    id,
    model,
    mail,
    save,
    fixed,
    events,
    reset,
    onLocked,
    parentBox,
    na,
    emailOn,
    hint,
    statusText,
    doReset,
    pickDigest,
    cell,
    setGrid: (n: HTMLDivElement) => (grid = n),
  }
}
