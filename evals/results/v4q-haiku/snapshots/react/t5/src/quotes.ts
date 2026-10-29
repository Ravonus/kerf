import { createContext, useCallback, useContext, useSyncExternalStore } from 'react'
import type { Holding, Stock } from './api'

export const HISTORY_LENGTH = 20

export type LiveQuote = { price: number; history: number[] }

/**
 * Live prices for the app. Each stock has its own listeners, so a quote re-renders only the row it belongs to,
 * and the portfolio listeners fire only when the portfolio value actually changes.
 */
export class QuoteStore {
  private quotes = new Map<string, LiveQuote>()
  private holdings: Holding[] = []
  private portfolio = 0
  private byId = new Map<string, Set<() => void>>()
  private portfolioListeners = new Set<() => void>()
  private allListeners = new Set<() => void>()
  private version = 0
  /** Quotes that arrive before the list has loaded; replayed in `init`. `null` once initialised. */
  private pending: { id: string; price: number }[] | null = []

  /** Seeds prices from the loaded list (history starts with that price), then replays early quotes. */
  init(stocks: Stock[], holdings: Holding[]) {
    this.holdings = holdings
    for (const s of stocks) this.quotes.set(s.id, { price: s.price, history: [s.price] })
    const early = this.pending ?? []
    this.pending = null
    this.recomputePortfolio()
    for (const q of early) this.push(q.id, q.price)
  }

  push = (id: string, price: number) => {
    if (this.pending) {
      this.pending.push({ id, price })
      return
    }
    const prev = this.quotes.get(id)
    if (!prev) return
    this.quotes.set(id, { price, history: [...prev.history, price].slice(-HISTORY_LENGTH) })
    this.version++
    this.byId.get(id)?.forEach(l => l())
    if (this.holdings.some(h => h.id === id)) this.recomputePortfolio()
    this.allListeners.forEach(l => l())
  }

  /** Changes on every quote. Used by views that depend on all prices at once (sorting by change). */
  getVersion = (): number => this.version

  subscribeAll = (listener: () => void): (() => void) => {
    this.allListeners.add(listener)
    return () => { this.allListeners.delete(listener) }
  }

  getQuote = (id: string): LiveQuote | undefined => this.quotes.get(id)

  getPortfolio = (): number => this.portfolio

  subscribe = (id: string, listener: () => void): (() => void) => {
    let set = this.byId.get(id)
    if (!set) this.byId.set(id, (set = new Set()))
    set.add(listener)
    return () => { set.delete(listener) }
  }

  subscribePortfolio = (listener: () => void): (() => void) => {
    this.portfolioListeners.add(listener)
    return () => { this.portfolioListeners.delete(listener) }
  }

  private recomputePortfolio() {
    const next = this.holdings.reduce((sum, h) => sum + h.qty * (this.quotes.get(h.id)?.price ?? 0), 0)
    if (next === this.portfolio) return
    this.portfolio = next
    this.portfolioListeners.forEach(l => l())
  }
}

export const QuoteContext = createContext<QuoteStore | null>(null)

const noopSubscribe = () => () => {}
const noSnapshot = () => undefined

/** The live quote for one stock, or `undefined` when no store is provided or it has not loaded yet. */
export function useQuote(id: string): LiveQuote | undefined {
  const store = useContext(QuoteContext)
  const subscribe = useCallback(
    (listener: () => void) => (store ? store.subscribe(id, listener) : noopSubscribe()),
    [store, id],
  )
  const getSnapshot = useCallback(() => (store ? store.getQuote(id) : undefined), [store, id])
  return useSyncExternalStore(subscribe, store ? getSnapshot : noSnapshot)
}
