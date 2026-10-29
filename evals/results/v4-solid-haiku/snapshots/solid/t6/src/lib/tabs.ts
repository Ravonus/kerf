import { createEffect, createSignal, type Accessor, type Setter } from 'solid-js'
import type { Sector } from '../api'
import { readStored, writeStored } from './storage'

export type TabKey = 'all' | Sector
export const TAB_KEYS: TabKey[] = ['all', 'tech', 'energy', 'health', 'finance']
/** Which tab is selected. */
export const TAB_KEY = 'watchlist:tab'

export type SortBy = 'symbol' | 'change'
export type SearchState = 'idle' | 'pending' | 'error'

export function parseTabKey(value: string | null): TabKey {
  return TAB_KEYS.includes(value as TabKey) ? (value as TabKey) : 'all'
}

/** The settings and search of one tab. The `All` tab keeps the original storage keys. */
export type Tab = {
  key: TabKey
  query: Accessor<string>
  setQuery: Setter<string>
  favoritesOnly: Accessor<boolean>
  setFavoritesOnly: Setter<boolean>
  sortBy: Accessor<SortBy>
  setSortBy: Setter<SortBy>
  /** Matching stock ids of the tab's latest answered search, null when no search is active. */
  results: Accessor<string[] | null>
  setResults: Setter<string[] | null>
  searchState: Accessor<SearchState>
  setSearchState: Setter<SearchState>
  /** Trimmed text of the tab's latest search, '' when none. */
  lastQuery: string
  /** Whether a search has been run for this tab in this page view (restored searches run on first show). */
  searched: boolean
  controller?: AbortController
}

export function createTab(key: TabKey): Tab {
  const storageKey = (name: string) => (key === 'all' ? `watchlist:${name}` : `watchlist:${key}:${name}`)
  const [query, setQuery] = createSignal(readStored(storageKey('search')) ?? '')
  const [favoritesOnly, setFavoritesOnly] = createSignal(readStored(storageKey('favoritesOnly')) === '1')
  const [sortBy, setSortBy] = createSignal<SortBy>(readStored(storageKey('sort')) === 'change' ? 'change' : 'symbol')
  const [results, setResults] = createSignal<string[] | null>(null)
  const [searchState, setSearchState] = createSignal<SearchState>('idle')
  createEffect(() => writeStored(storageKey('search'), query()))
  createEffect(() => writeStored(storageKey('favoritesOnly'), favoritesOnly() ? '1' : '0'))
  createEffect(() => writeStored(storageKey('sort'), sortBy()))
  return {
    key,
    query,
    setQuery,
    favoritesOnly,
    setFavoritesOnly,
    sortBy,
    setSortBy,
    results,
    setResults,
    searchState,
    setSearchState,
    lastQuery: '',
    searched: false,
  }
}
