// Sector tabs and the settings each tab keeps (search text, Favorites only, Sort).
import type { Sector } from '../api'
import { stored } from './storage'

export type Tab = 'All' | Sector
export const TABS: Tab[] = ['All', 'tech', 'energy', 'health', 'finance']
export type Sort = 'symbol' | 'change'
export type View = { query: string; favoritesOnly: boolean; sort: Sort }

const fresh = (): View => ({ query: '', favoritesOnly: false, sort: 'symbol' })

/**
 * Every tab's settings, as saved. The All tab also reads the settings saved before there were tabs, so an upgrade
 * keeps them. Saved data is untrusted: anything unexpected falls back to the defaults.
 */
export function restoreViews(): Record<Tab, View> {
  const views = Object.fromEntries(TABS.map(t => [t, fresh()])) as Record<Tab, View>
  views.All = {
    query: stored('watchlist.search', ''),
    favoritesOnly: stored('watchlist.favoritesOnly', 'false') === 'true',
    sort: stored('watchlist.sort', 'symbol') === 'change' ? 'change' : 'symbol',
  }
  try {
    const saved = JSON.parse(stored('watchlist.views', '{}'))
    for (const t of TABS) {
      const v = saved?.[t]
      if (v && typeof v === 'object') {
        views[t] = {
          query: typeof v.query === 'string' ? v.query : '',
          favoritesOnly: v.favoritesOnly === true,
          sort: v.sort === 'change' ? 'change' : 'symbol',
        }
      }
    }
  } catch {
    // unreadable: keep the defaults
  }
  return views
}

export function restoreTab(): Tab {
  const saved = stored('watchlist.tab', 'All')
  return (TABS as string[]).includes(saved) ? (saved as Tab) : 'All'
}
