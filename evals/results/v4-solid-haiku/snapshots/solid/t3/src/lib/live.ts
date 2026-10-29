import { batch, createSignal, type Accessor } from 'solid-js'
import type { Stock } from '../api'

/** How many prices a sparkline keeps. */
export const HISTORY_LENGTH = 20

/**
 * Live state for one stock. Price and history are separate signals, so a quote re-runs only the
 * expressions that read what changed: a row's price and change (if the price moved) and its sparkline.
 */
export type LiveQuote = {
  price: Accessor<number>
  history: Accessor<number[]>
  /** Records a quote: the price becomes current and is appended to the history. */
  apply(price: number): void
}

export function createLiveQuote(initialPrice: number): LiveQuote {
  const [price, setPrice] = createSignal(initialPrice)
  const [history, setHistory] = createSignal<number[]>([initialPrice])
  return {
    price,
    history,
    apply(next) {
      batch(() => {
        setPrice(() => next)
        setHistory(h => [...h.slice(-(HISTORY_LENGTH - 1)), next])
      })
    },
  }
}

/** One live quote per stock, keyed by stock id, starting at the loaded price. */
export function createLiveQuotes(stocks: Stock[]): Map<string, LiveQuote> {
  return new Map(stocks.map(s => [s.id, createLiveQuote(s.price)]))
}
