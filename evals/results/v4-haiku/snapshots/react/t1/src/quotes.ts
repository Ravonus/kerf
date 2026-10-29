import { useCallback, useSyncExternalStore } from 'react'
import type { Holding, Quote, Stock } from './api'

export type Entry = { price: number; history: number[] }

const HISTORY = 20

/**
 * Live quote state. Each stock has its own entry and listeners, so a quote only wakes the row for that stock
 * (and the portfolio value, if it changes). Entries are replaced, never mutated, so snapshots compare by identity.
 */
export class QuoteStore {
  readonly stocks: Stock[]
  private entries = new Map<string, Entry>()
  private rowListeners = new Map<string, Set<() => void>>()
  private portfolioListeners = new Set<() => void>()
  private holdings: Holding[]
  private portfolio = 0

  constructor(stocks: Stock[], holdings: Holding[]) {
    this.stocks = stocks
    this.holdings = holdings
    for (const s of stocks) this.entries.set(s.id, { price: s.price, history: [s.price] })
    this.portfolio = this.computePortfolio()
  }

  apply = (q: Quote) => {
    const e = this.entries.get(q.id)
    if (!e) return
    this.entries.set(q.id, { price: q.price, history: [...e.history, q.price].slice(-HISTORY) })
    this.rowListeners.get(q.id)?.forEach(cb => cb())
    const next = this.computePortfolio()
    if (next !== this.portfolio) {
      this.portfolio = next
      this.portfolioListeners.forEach(cb => cb())
    }
  }

  entry = (id: string): Entry => this.entries.get(id)!

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
