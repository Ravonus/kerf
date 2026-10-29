export type Sector = 'tech' | 'energy' | 'health' | 'finance'

export type Stock = {
  id: string
  symbol: string
  name: string
  sector: Sector
  price: number
  prevClose: number
  favorite: boolean
}

export type Holding = { id: string; qty: number }

export type Quote = { id: string; price: number }

export interface Api {
  listStocks(): Promise<Stock[]>
  listHoldings(): Promise<Holding[]>
  /** Pushes live quotes. Returns an unsubscribe function. */
  subscribeQuotes(onQuote: (quote: Quote) => void): () => void
  /** Ids of the stocks matching `query`, in list order. Rejects with an AbortError when `signal` aborts. */
  search(query: string, signal: AbortSignal): Promise<string[]>
}

const words = ['Acme', 'Bolt', 'Cedar', 'Delta', 'Ember', 'Flux', 'Grove', 'Helix', 'Ion', 'Juno']
const kinds = ['Labs', 'Energy', 'Health', 'Capital', 'Systems']
const sectors: Sector[] = ['tech', 'energy', 'health', 'finance']

/** 200 stocks: ids `s0`…`s199`, symbols like `ACM0`. */
export function seedStocks(n = 200): Stock[] {
  return Array.from({ length: n }, (_, i) => {
    const word = words[i % words.length]
    const prevClose = Math.round((10 + ((i * 37) % 290)) * 100) / 100
    return {
      id: `s${i}`,
      symbol: `${word.slice(0, 3).toUpperCase()}${Math.floor(i / words.length)}`,
      name: `${word} ${kinds[i % kinds.length]}`,
      sector: sectors[i % sectors.length],
      price: Math.round(prevClose * (0.97 + ((i * 7) % 7) / 100) * 100) / 100,
      prevClose,
      favorite: i % 9 === 0,
    }
  })
}

export function createFakeApi(): Api {
  const stocks = seedStocks()
  const listeners = new Set<(quote: Quote) => void>()
  const current = new Map(stocks.map(s => [s.id, s.price]))
  let timer: ReturnType<typeof setInterval> | undefined

  // One random quote every 300 ms (a few per second), as a small random walk around the last price.
  const tick = () => {
    const s = stocks[Math.floor(Math.random() * stocks.length)]
    const price = Math.round(current.get(s.id)! * (1 + (Math.random() - 0.5) * 0.02) * 100) / 100
    current.set(s.id, price)
    for (const l of listeners) l({ id: s.id, price })
  }

  return {
    listStocks: () => new Promise(resolve => setTimeout(() => resolve(structuredClone(stocks)), 300)),
    listHoldings: () => Promise.resolve([{ id: 's0', qty: 10 }, { id: 's3', qty: 5 }, { id: 's42', qty: 2 }]),
    search(query, signal) {
      const q = query.toLowerCase()
      const ids = stocks.filter(s => `${s.symbol} ${s.name}`.toLowerCase().includes(q)).map(s => s.id)
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer)
          reject(new DOMException('Aborted', 'AbortError'))
        }
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort)
          resolve(ids)
        }, 150)
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      })
    },
    subscribeQuotes(onQuote) {
      listeners.add(onQuote)
      timer ??= setInterval(tick, 300)
      return () => {
        listeners.delete(onQuote)
        if (listeners.size === 0 && timer !== undefined) {
          clearInterval(timer)
          timer = undefined
        }
      }
    },
  }
}
