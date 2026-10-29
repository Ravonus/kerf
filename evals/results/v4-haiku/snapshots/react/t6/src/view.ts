import { loadString, saveString } from './storage'

export const TABS = ['All', 'tech', 'energy', 'health', 'finance'] as const
export type Tab = (typeof TABS)[number]
export type SortKey = 'symbol' | 'change'
export type TabSettings = { search: string; favoritesOnly: boolean; sort: SortKey }
export type View = { tab: Tab; tabs: Record<Tab, TabSettings> }

const KEY = 'watchlist.view'

function defaults(): View {
  const tabs = Object.fromEntries(
    TABS.map(t => [t, { search: '', favoritesOnly: false, sort: 'symbol' } satisfies TabSettings]),
  ) as Record<Tab, TabSettings>
  return { tab: 'All', tabs }
}

/** The selected tab and each tab's settings, as saved. Unknown or broken values fall back to the defaults. */
export function loadView(): View {
  const view = defaults()
  try {
    const saved = JSON.parse(loadString(KEY, 'null'))
    if (!saved || typeof saved !== 'object') return view
    if ((TABS as readonly string[]).includes(saved.tab)) view.tab = saved.tab
    for (const t of TABS) {
      const s = saved.tabs?.[t]
      if (!s || typeof s !== 'object') continue
      if (typeof s.search === 'string') view.tabs[t].search = s.search
      if (typeof s.favoritesOnly === 'boolean') view.tabs[t].favoritesOnly = s.favoritesOnly
      if (s.sort === 'symbol' || s.sort === 'change') view.tabs[t].sort = s.sort
    }
  } catch {
    // Unreadable saved view: keep the defaults.
  }
  return view
}

export function saveView(view: View): void {
  saveString(KEY, JSON.stringify(view))
}
