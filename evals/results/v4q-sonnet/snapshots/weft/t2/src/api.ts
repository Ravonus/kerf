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

export interface Api {
  listStocks(): Promise<Stock[]>
  listHoldings(): Promise<Holding[]>
  search(query: string, signal: AbortSignal): Promise<string[]> // ids of the matching stocks, in list order
  subscribeQuotes(onQuote: (quote: { id: string; price: number }) => void): () => void // returns unsubscribe
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
      return new Promise<string[]>((resolve, reject) => {
        const abort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }
        const t = setTimeout(() => {
          signal.removeEventListener('abort', abort)
          const q = query.toLowerCase()
          resolve(stocks.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).map(s => s.id))
        }, 50 + Math.random() * 250)
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      })
    },
    subscribeQuotes(onQuote) {
      const timer = setInterval(() => {
        for (let k = 0; k < 3; k++) {
          const s = stocks[Math.floor(Math.random() * stocks.length)]
          onQuote({ id: s.id, price: Math.max(0.01, Math.round(s.prevClose * (0.9 + Math.random() * 0.2) * 100) / 100) })
        }
      }, 250)
      return () => clearInterval(timer)
    },
  }
}
