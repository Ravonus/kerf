import { prefCell, type PrefEvent, type PrefRules, type PrefValues } from '@weft-js/warp-core'
import type { State } from '@weft-js/core'
import type { Inputs } from './NotificationPreferencesModel'
import type { preferencesSave } from './NotificationPreferencesSave'

export function preferencesActions(
  p: () => Inputs,
  model: State<PrefValues>,
  mail: State<string>,
  events: { readonly value: PrefEvent[] },
  reset: Inputs['defaults'],
  fixed: PrefRules,
  commit: ReturnType<typeof preferencesSave>['commit'],
) {
  const doReset = () =>
    commit(
      () => {
        model.value = reset!.value
        mail.value = reset!.digest ?? 'instant'
      },
      async () => {
        await p().onChange?.(
          events.value.flatMap((e) =>
            p().channels.flatMap((c) =>
              prefCell(reset!.value, fixed, e.id, c.id) === 'na' ||
              prefCell(reset!.value, fixed, e.id, c.id) === 'locked'
                ? []
                : [{ event: e.id, channel: c.id, on: !!reset!.value[e.id]?.[c.id] }],
            ),
          ),
        )
        await p().onDigest?.(reset!.digest ?? 'instant')
      },
      'Notification settings reset to defaults',
    )
  const pickDigest = (e: Event) => {
    const el = e.target as HTMLSelectElement
    const next = el.value
    void commit(
      () => (mail.value = next),
      () => p().onDigest?.(next),
      `Email delivery: ${el.selectedOptions[0]!.textContent}`,
    )
  }

  return { doReset, pickDigest }
}
