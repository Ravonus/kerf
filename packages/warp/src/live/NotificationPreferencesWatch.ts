import { gridNav, type PrefValues } from '@weft-js/warp-core'
import { onMount, watch, type State } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
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
      () => p().digest,
      (d) => {
        if (save.value !== 'saving') mail.value = d
      },
    )
  })
  use(gridNav, grid, () => ({ targets: CELL }))
}
