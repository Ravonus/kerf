import { use } from '@kerf-js/veneer-core/kerf'
import { untrack } from '@kerf-js/core'
import type { Interaction } from '@kerf-js/core/interaction'

/** `ui={row}`: a row's `attach` on the host. Read once, like every prop that picks what a component is. */
export function useUi(ui: () => Interaction | undefined, host: () => HTMLElement | undefined) {
  const row = untrack(ui)
  // oxlint-disable-next-line typescript/unbound-method -- interaction() closes over its row: attach reads no `this`
  if (row) use(row.attach, host)
}
