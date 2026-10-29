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
  setFavorite(id: string, favorite: boolean): Promise<void>
  details(id: string): Promise<{ description: string }>
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
    search: (query, signal) => new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }
      const t = setTimeout(() => {
        signal.removeEventListener('abort', abort)
        const q = query.toLowerCase()
        resolve(stocks.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).map(s => s.id))
      }, 50)
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    }),
    setFavorite: () => new Promise(resolve => setTimeout(resolve, 100)),
    details: id => new Promise((resolve, reject) => setTimeout(() => {
      const s = stocks.find(x => x.id === id)
      if (s) resolve({ description: `${s.name} operates in the ${s.sector} sector.` })
      else reject(new Error('not found'))
    }, 100)),
    subscribeQuotes(onQuote) {
      const timer = setInterval(() => {
        for (let k = 0; k < 3; k++) {
          const s = stocks[Math.floor(Math.random() * stocks.length)]
          onQuote({ id: s.id, price: Math.round(s.prevClose * (0.9 + Math.random() * 0.2) * 100) / 100 })
        }
      }, 1000)
      return () => clearInterval(timer)
    },
  }
}
