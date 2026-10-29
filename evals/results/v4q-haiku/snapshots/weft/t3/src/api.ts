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

/** The app's live view of each stock: its current price and the last 20 prices, oldest first. */
export type Quotes = Record<string, { price: number; history: number[] }>

export interface Api {
  listStocks(): Promise<Stock[]>
  listHoldings(): Promise<Holding[]>
  /** Calls `onQuote` for every pushed quote. Returns the unsubscribe function. */
  subscribeQuotes(onQuote: (quote: Quote) => void): () => void
  /** Ids of the stocks matching `query`, in list order. Rejects with an AbortError when `signal` aborts. */
  search(query: string, signal: AbortSignal): Promise<string[]>
  /** Saves the favorite flag. Rejects if the server refused. */
  setFavorite(id: string, favorite: boolean): Promise<void>
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

/** Pushes one random quote every 250 ms (about four a second) while anyone is subscribed. */
export function createFakeApi(): Api {
  const stocks = seedStocks()
  const last = new Map(stocks.map(s => [s.id, s.price]))
  const listeners = new Set<(quote: Quote) => void>()
  let timer: ReturnType<typeof setInterval> | undefined

  const tick = () => {
    const s = stocks[Math.floor(Math.random() * stocks.length)]
    const price = Math.round((last.get(s.id)! * (1 + (Math.random() - 0.5) * 0.02)) * 100) / 100
    last.set(s.id, price)
    for (const l of listeners) l({ id: s.id, price })
  }

  return {
    listStocks: () => new Promise(resolve => setTimeout(() => resolve(structuredClone(stocks)), 300)),
    listHoldings: () => Promise.resolve([{ id: 's0', qty: 10 }, { id: 's3', qty: 5 }, { id: 's42', qty: 2 }]),
    search(query, signal) {
      return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Search aborted', 'AbortError'))
        // Random latency, so answers to older queries can arrive after newer ones.
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort)
          const q = query.toLowerCase()
          resolve(stocks.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).map(s => s.id))
        }, 50 + Math.random() * 250)
        const abort = () => {
          clearTimeout(timer)
          reject(new DOMException('Search aborted', 'AbortError'))
        }
        signal.addEventListener('abort', abort, { once: true })
      })
    },
    setFavorite(id, favorite) {
      return new Promise((resolve) => {
        setTimeout(() => {
          const stock = stocks.find(s => s.id === id)
          if (stock) stock.favorite = favorite
          resolve()
        }, 100)
      })
    },
    subscribeQuotes(onQuote) {
      listeners.add(onQuote)
      timer ??= setInterval(tick, 250)
      return () => {
        listeners.delete(onQuote)
        if (!listeners.size && timer !== undefined) {
          clearInterval(timer)
          timer = undefined
        }
      }
    },
  }
}
