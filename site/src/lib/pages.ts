import pages from '../generated/toolkit.json'
import type { Page } from '../components/ComponentPage'

const all = pages as unknown as Record<string, Page>
export type Area = 'components' | 'blocks' | 'charts'
export const pageIn = (area: Area, slug: string) => (all[slug]?.area === area ? all[slug] : undefined)
export const slugsIn = (area: Area) => Object.values(all).filter(p => p.area === area).map(p => ({ slug: p.slug }))
