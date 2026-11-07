import { createRoot, getOwner, onCleanup, state } from '@weft-js/core'
import { hole, rt } from '@weft-js/core/internal'

/** Keep one route view alive while its pending shape occupies the same outlet. */
export function retainRouteView(view: () => unknown, pending: () => unknown) {
  if (rt.server) return () => pending() ?? view()
  const parent = getOwner()
  const content = state<unknown>(undefined)
  let dispose = () => {}
  createRoot((end) => {
    dispose = end
    hole(view, (value) => {
      content.value = value
    })
  }, parent)
  onCleanup(() => dispose())
  return () => pending() ?? content.value
}
