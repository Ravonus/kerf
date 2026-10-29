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
  search(query: string, signal: AbortSignal): Promise<string[]>
  setFavorite(id: string, favorite: boolean): Promise<void> // rejects if the server refused
  subscribeQuotes(onQuote: (quote: { id: string; price: number }) => void): () => void
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
    setFavorite(id, favorite) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          const s = stocks.find(x => x.id === id)
          if (!s) return reject(new Error('unknown stock'))
          s.favorite = favorite
          resolve()
        }, 150)
      })
    },
    search(query, signal) {
      return new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException('Aborted', 'AbortError'))
        if (signal.aborted) return abort()
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort)
          const q = query.trim().toLowerCase()
          resolve(stocks.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).map(s => s.id))
        }, 100 + Math.random() * 300)
        const onAbort = () => { clearTimeout(timer); abort() }
        signal.addEventListener('abort', onAbort, { once: true })
      })
    },
    subscribeQuotes(onQuote) {
      const last = new Map(stocks.map(s => [s.id, s.price]))
      const timer = setInterval(() => {
        for (let k = 0; k < 3; k++) {
          const s = stocks[Math.floor(Math.random() * stocks.length)]
          const price = Math.max(1, Math.round(last.get(s.id)! * (1 + (Math.random() - 0.5) * 0.02) * 100) / 100)
          last.set(s.id, price)
          onQuote({ id: s.id, price })
        }
      }, 1000)
      return () => clearInterval(timer)
    },
  }
}
