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
  /** Pushes quotes until the returned function is called. */
  subscribeQuotes(onQuote: (quote: Quote) => void): () => void
  /** Ids of the stocks whose name or symbol contains `query` (case-insensitive), in list order. */
  search(query: string, signal: AbortSignal): Promise<string[]>
  /** Saves a stock's favorite flag. Rejects if the server refused. */
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

export function createFakeApi(): Api {
  const stocks = seedStocks()
  return {
    listStocks: () => new Promise(resolve => setTimeout(() => resolve(structuredClone(stocks)), 300)),
    listHoldings: () => Promise.resolve([{ id: 's0', qty: 10 }, { id: 's3', qty: 5 }, { id: 's42', qty: 2 }]),
    search(query, signal) {
      const q = query.toLowerCase()
      return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
        const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort)
          resolve(stocks.filter(s => `${s.name} ${s.symbol}`.toLowerCase().includes(q)).map(s => s.id))
        }, 150)
        signal.addEventListener('abort', onAbort, { once: true })
      })
    },
    setFavorite(id, favorite) {
      return new Promise<void>(resolve => setTimeout(() => {
        const s = stocks.find(x => x.id === id)
        if (s) s.favorite = favorite
        resolve()
      }, 200))
    },
    subscribeQuotes(onQuote) {
      // Four random quotes a second, each a small move from the stock's last price.
      const last = new Map(stocks.map(s => [s.id, s.price]))
      const timer = setInterval(() => {
        const s = stocks[Math.floor(Math.random() * stocks.length)]
        const price = Math.round((last.get(s.id)! * (0.99 + Math.random() * 0.02)) * 100) / 100
        last.set(s.id, price)
        onQuote({ id: s.id, price })
      }, 250)
      return () => clearInterval(timer)
    },
  }
}
