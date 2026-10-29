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
  /** Saves a favorite flag. Rejects if the server refused. */
  setFavorite(id: string, favorite: boolean): Promise<void>
  /** Long description for the details panel. Rejects on failure. */
  details(id: string): Promise<{ description: string }>
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
  return {
    listStocks: () => new Promise(resolve => setTimeout(() => resolve(structuredClone(stocks)), 300)),
    listHoldings: () => Promise.resolve([{ id: 's0', qty: 10 }, { id: 's3', qty: 5 }, { id: 's42', qty: 2 }]),
    subscribeQuotes(onQuote) {
      // Random walk from the seed prices: a few quotes per second on random stocks.
      const current = new Map(stocks.map(s => [s.id, s.price]))
      const timer = setInterval(() => {
        for (let k = 0; k < 2; k++) {
          const s = stocks[Math.floor(Math.random() * stocks.length)]
          const price = Math.round((current.get(s.id)! * (1 + (Math.random() - 0.5) * 0.02)) * 100) / 100
          current.set(s.id, price)
          onQuote({ id: s.id, price })
        }
      }, 300)
      return () => clearInterval(timer)
    },
    setFavorite: () => new Promise(resolve => setTimeout(resolve, 150)),
    details: (id) => new Promise(resolve => setTimeout(() => resolve({ description: `${id}: a company on the watchlist.` }), 400)),
    search(query, signal) {
      return new Promise((resolve, reject) => {
        const q = query.toLowerCase()
        const abort = () => reject(new DOMException('Aborted', 'AbortError'))
        if (signal.aborted) return abort()
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort)
          resolve(stocks.filter(s => `${s.symbol} ${s.name}`.toLowerCase().includes(q)).map(s => s.id))
        }, 100 + Math.random() * 300)
        signal.addEventListener('abort', () => { clearTimeout(timer); abort() }, { once: true })
      })
    },
  }
}
