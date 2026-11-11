import { gridNav, type PrefValues } from '@kerf-js/veneer-core'
import { onMount, watch, type State } from '@kerf-js/core'
import { use } from '@kerf-js/veneer-core/kerf'
import { val } from './shared'
import type { Inputs, Save } from './NotificationPreferencesModel'

const CELL = 'input[type="checkbox"], [data-part="na"]'

export function preferencesWatch(
  p: () => Inputs,
  model: State<PrefValues>,
  mail: State<string>,
  save: State<Save>,
  grid: () => HTMLDivElement | undefined,
) {
  onMount(() => {
    watch(
      () => val<PrefValues>(p().value),
      (v) => {
        if (save.value !== 'saving') model.value = v
      },
    )
    watch(
      () => (p().digest === undefined ? 'instant' : p().digest!),
      (d) => {
        if (save.value !== 'saving') mail.value = d
      },
    )
  })
  use(gridNav, grid, () => ({ targets: CELL }))
}
