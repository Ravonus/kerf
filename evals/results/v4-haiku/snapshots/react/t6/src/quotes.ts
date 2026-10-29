import { useCallback, useSyncExternalStore } from 'react'
import type { Holding, Quote, Stock } from './api'

export type Entry = { price: number; history: number[] }

const HISTORY = 20
const NO_FAVORITES: ReadonlySet<string> = new Set()

/**
 * Live state for the list. Each stock has its own entry and listeners, so a quote only wakes the row for that stock
 * (and the portfolio value, if it changes). Entries and the favorite set are replaced, never mutated, so snapshots
 * compare by identity. A burst of quotes sent synchronously is applied at once and rendered once by React, because
 * React batches the store updates made within one synchronous run.
 */
export class QuoteStore {
  readonly stocks: Stock[]
  private byId = new Map<string, Stock>()
  private entries = new Map<string, Entry>()
  private rowListeners = new Map<string, Set<() => void>>()
  private portfolioListeners = new Set<() => void>()
  private favListeners = new Set<() => void>()
  private versionListeners = new Set<() => void>()
  private holdings: Holding[]
  private portfolio = 0
  private ver = 0
  private favorites: ReadonlySet<string>
  // Per stock: how many times it has been clicked. A failed save only reverts if it is still the latest click.
  private clicks = new Map<string, number>()

  constructor(stocks: Stock[], holdings: Holding[]) {
    this.stocks = stocks
    this.holdings = holdings
    for (const s of stocks) {
      this.byId.set(s.id, s)
      this.entries.set(s.id, { price: s.price, history: [s.price] })
    }
    this.portfolio = this.computePortfolio()
    this.favorites = new Set(stocks.filter(s => s.favorite).map(s => s.id))
  }

  apply = (q: Quote) => {
    const e = this.entries.get(q.id)
    if (!e) return
    this.entries.set(q.id, { price: q.price, history: [...e.history, q.price].slice(-HISTORY) })
    this.ver++
    this.rowListeners.get(q.id)?.forEach(cb => cb())
    const next = this.computePortfolio()
    if (next !== this.portfolio) {
      this.portfolio = next
      this.portfolioListeners.forEach(cb => cb())
    }
    this.versionListeners.forEach(cb => cb())
  }

  entry = (id: string): Entry => this.entries.get(id)!

  stock = (id: string): Stock => this.byId.get(id)!

  /** Gain versus the previous close, as a raw number (for sorting; not formatted). */
  changeOf = (id: string): number => {
    const s = this.byId.get(id)!
    return (this.entries.get(id)!.price - s.prevClose) / s.prevClose
  }

  subscribeRow = (id: string, cb: () => void) => {
    let set = this.rowListeners.get(id)
    if (!set) this.rowListeners.set(id, (set = new Set()))
    set.add(cb)
    return () => { set!.delete(cb) }
  }

  subscribePortfolio = (cb: () => void) => {
    this.portfolioListeners.add(cb)
    return () => { this.portfolioListeners.delete(cb) }
  }

  portfolioValue = () => this.portfolio

  version = () => this.ver

  subscribeVersion = (cb: () => void) => {
    this.versionListeners.add(cb)
    return () => { this.versionListeners.delete(cb) }
  }

  isFavorite = (id: string) => this.favorites.has(id)

  favoriteSet = () => this.favorites

  subscribeFavorites = (cb: () => void) => {
    this.favListeners.add(cb)
    return () => { this.favListeners.delete(cb) }
  }

  /** Flips a favorite right away. Returns the click's token for `revertFavorite`. */
  setFavoriteOptimistic(id: string, value: boolean): number {
    const token = (this.clicks.get(id) ?? 0) + 1
    this.clicks.set(id, token)
    this.writeFavorite(id, value)
    return token
  }

  /** Puts a favorite back, unless the user has clicked that star again since `token`. */
  revertFavorite(id: string, token: number, value: boolean) {
    if (this.clicks.get(id) === token) this.writeFavorite(id, value)
  }

  private writeFavorite(id: string, value: boolean) {
    if (this.favorites.has(id) === value) return
    const next = new Set(this.favorites)
    if (value) next.add(id)
    else next.delete(id)
    this.favorites = next
    this.favListeners.forEach(cb => cb())
  }

  private computePortfolio() {
    return this.holdings.reduce((sum, h) => sum + h.qty * (this.entries.get(h.id)?.price ?? 0), 0)
  }
}

export function useEntry(store: QuoteStore, id: string): Entry {
  const subscribe = useCallback((cb: () => void) => store.subscribeRow(id, cb), [store, id])
  const get = useCallback(() => store.entry(id), [store, id])
  return useSyncExternalStore(subscribe, get)
}

export function usePortfolio(store: QuoteStore): number {
  return useSyncExternalStore(store.subscribePortfolio, store.portfolioValue)
}

/** Changes whenever any quote arrives, but only while `enabled` (used to re-sort by change). */
export function useQuoteVersion(store: QuoteStore | null, enabled: boolean): number {
  const subscribe = useCallback(
    (cb: () => void) => (store && enabled ? store.subscribeVersion(cb) : () => {}),
    [store, enabled],
  )
  return useSyncExternalStore(subscribe, () => (store ? store.version() : 0))
}

/** The favorite set, or an empty one while the store is loading. */
export function useFavoriteSet(store: QuoteStore | null): ReadonlySet<string> {
  const subscribe = useCallback((cb: () => void) => (store ? store.subscribeFavorites(cb) : () => {}), [store])
  return useSyncExternalStore(subscribe, () => (store ? store.favoriteSet() : NO_FAVORITES))
}
