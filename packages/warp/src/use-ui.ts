import { use } from '@weft-js/warp-core/weft'
import { untrack } from '@weft-js/core'
import type { Interaction } from '@weft-js/core/interaction'

/** `ui={row}`: a row's `attach` on the host. Read once, like every prop that picks what a component is. */
export function useUi(ui: () => Interaction | undefined, host: () => HTMLElement | undefined) {
  const row = untrack(ui)
  // oxlint-disable-next-line typescript/unbound-method -- interaction() closes over its row: attach reads no `this`
  if (row) use(row.attach, host)
}
