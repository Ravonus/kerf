import type { Holding, Stock } from './api'

export type Quote = { id: string; price: number }
export type RowState = { stock: Stock; price: number; history: number[]; favorite: boolean }

const HISTORY = 20

/** External quote store: each row and the portfolio value subscribe separately, so a quote only wakes what changed. */
export class QuoteStore {
  private rows = new Map<string, RowState>()
  private holdings: Holding[] = []
  private portfolio = 0
  private loaded = false
  private pending: Quote[] = []
  private rowListeners = new Map<string, Set<() => void>>()
  private portfolioListeners = new Set<() => void>()

  load(stocks: Stock[], holdings: Holding[]) {
    this.rows = new Map(stocks.map(s => [s.id, { stock: s, price: s.price, history: [s.price], favorite: s.favorite }]))
    this.holdings = holdings
    this.loaded = true
    const queued = this.pending
    this.pending = []
    for (const q of queued) this.apply(q, false)
    this.portfolio = this.computePortfolio()
  }

  push(q: Quote) {
    if (!this.loaded) this.pending.push(q)
    else this.apply(q, true)
  }

  private apply(q: Quote, notify: boolean) {
    const row = this.rows.get(q.id)
    if (!row) return
    const history = row.history.length >= HISTORY ? row.history.slice(1) : row.history.slice()
    history.push(q.price)
    this.rows.set(q.id, { ...row, price: q.price, history })
    if (!notify) return
    this.rowListeners.get(q.id)?.forEach(l => l())
    this.quoteVersion++
    this.quoteListeners.forEach(l => l())
    if (this.holdings.some(h => h.id === q.id)) {
      const next = this.computePortfolio()
      if (next !== this.portfolio) {
        this.portfolio = next
        this.portfolioListeners.forEach(l => l())
      }
    }
  }

  private computePortfolio() {
    return this.holdings.reduce((sum, h) => sum + h.qty * (this.rows.get(h.id)?.price ?? 0), 0)
  }

  private quoteVersion = 0
  private quoteListeners = new Set<() => void>()
  getQuoteVersion = () => this.quoteVersion
  subscribeAnyQuote = (l: () => void) => {
    this.quoteListeners.add(l)
    return () => { this.quoteListeners.delete(l) }
  }

  /** Percent change versus prevClose. */
  change(id: string) {
    const r = this.rows.get(id)!
    return (r.price - r.stock.prevClose) / r.stock.prevClose
  }

  private clicks = new Map<string, number>()
  private favVersion = 0
  private favListeners = new Set<() => void>()

  /** Records a user click on a star and returns its sequence number. */
  bumpClick(id: string) {
    const n = (this.clicks.get(id) ?? 0) + 1
    this.clicks.set(id, n)
    return n
  }
  clickCount = (id: string) => this.clicks.get(id) ?? 0

  setFavorite(id: string, favorite: boolean) {
    const row = this.rows.get(id)
    if (!row || row.favorite === favorite) return
    this.rows.set(id, { ...row, favorite })
    this.rowListeners.get(id)?.forEach(l => l())
    this.favVersion++
    this.favListeners.forEach(l => l())
  }
  getFavVersion = () => this.favVersion
  subscribeFavorites = (l: () => void) => {
    this.favListeners.add(l)
    return () => { this.favListeners.delete(l) }
  }

  getRow = (id: string) => this.rows.get(id)!
  getPortfolio = () => this.portfolio

  subscribeRow = (id: string, l: () => void) => {
    let set = this.rowListeners.get(id)
    if (!set) this.rowListeners.set(id, (set = new Set()))
    set.add(l)
    return () => { set!.delete(l) }
  }
  subscribePortfolio = (l: () => void) => {
    this.portfolioListeners.add(l)
    return () => { this.portfolioListeners.delete(l) }
  }
}

/** Saved notes plus an undo stack of earlier saves (most recent last). */
export class NotesStore {
  private notes = new Map<string, string>()
  private stack: { id: string; prev: string }[] = []
  private listeners = new Set<() => void>()

  get = (id: string) => this.notes.get(id) ?? ''
  depth = () => this.stack.length

  save(id: string, text: string) {
    this.stack.push({ id, prev: this.get(id) })
    this.notes.set(id, text)
    this.emit()
  }
  /** Undoes the most recent save; returns what it restored. */
  undo(): { id: string; note: string } | null {
    const last = this.stack.pop()
    if (!last) return null
    this.notes.set(last.id, last.prev)
    this.emit()
    return { id: last.id, note: last.prev }
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }
  private emit() { this.listeners.forEach(l => l()) }
}
