import { createRoot, getOwner, onCleanup, state, type Owner } from '@kerf-js/core'
import { hole, rt } from '@kerf-js/core/internal'

/**
 * Keep one route view alive while its pending shape occupies the same outlet. `hide` hears about it first, with the
 * view's owner: what the view keeps in the page by itself has to leave with it.
 */
export function retainRouteView(
  view: () => unknown,
  pending: () => unknown,
  hide?: (root: Owner) => void,
) {
  if (rt.server) return () => pending() ?? view()
  const parent = getOwner()
  const content = state<unknown>(undefined)
  let dispose = () => {}
  let root: Owner | null = null
  createRoot((end) => {
    dispose = end
    root = getOwner()
    hole(view, (value) => {
      content.value = value
    })
  }, parent)
  onCleanup(() => dispose())
  return () => {
    const shape = pending()
    if (shape === undefined) return content.value
    if (root) hide?.(root)
    return shape ?? content.value
  }
}
