import pages from '../generated/toolkit.json'
import type { Page } from '../components/ComponentPage'

const all = pages as unknown as Record<string, Page>
export type Area = 'components' | 'blocks' | 'charts'
/** Each area's frames and hub cards move in their own warp.flow family: a component settles on its bench, a block unfolds like the page section it is, a chart opens along its time axis. */
export const FLOW: Record<Area, 'specimen' | 'block' | 'plot'> = {
  components: 'specimen',
  blocks: 'block',
  charts: 'plot',
}
export const pageIn = (area: Area, slug: string) =>
  all[slug]?.area === area ? all[slug] : undefined
export const slugsIn = (area: Area) =>
  Object.values(all)
    .filter((p) => p.area === area)
    .map((p) => ({ slug: p.slug }))
