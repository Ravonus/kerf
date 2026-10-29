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
  subscribeQuotes(onQuote: (quote: Quote) => void): () => void
  search(query: string, signal: AbortSignal): Promise<string[]>
  setFavorite(id: string, favorite: boolean): Promise<void>
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
      const timer = setInterval(() => {
        const s = stocks[Math.floor(Math.random() * stocks.length)]
        onQuote({ id: s.id, price: Math.round(s.price * (0.95 + Math.random() * 0.1) * 100) / 100 })
      }, 250)
      return () => clearInterval(timer)
    },
    search: (query, signal) =>
      new Promise((resolve, reject) => {
        const q = query.toLowerCase()
        const timer = setTimeout(() => resolve(stocks.filter(s => `${s.symbol} ${s.name}`.toLowerCase().includes(q)).map(s => s.id)), 100 + Math.random() * 400)
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')) })
      }),
    setFavorite: () => new Promise((resolve, reject) => setTimeout(() => (Math.random() < 0.2 ? reject(new Error('refused')) : resolve()), 300)),
    details: id =>
      new Promise((resolve, reject) =>
        setTimeout(() => (Math.random() < 0.2 ? reject(new Error('unavailable')) : resolve({ description: `About ${id}.` })), 300)),
  }
}
