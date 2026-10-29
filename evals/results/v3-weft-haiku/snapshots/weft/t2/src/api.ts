export type Category = 'fruit' | 'bakery' | 'dairy'

export type Product = { id: string; name: string; category: Category; price: number; stock: number }

export type PriceUpdate = { id: string; price: number }

export interface Api {
  listProducts(): Promise<Product[]>
  /** Calls onUpdate whenever a price changes. Returns an unsubscribe function. */
  subscribePrices(onUpdate: (update: PriceUpdate) => void): () => void
}

const seed: Product[] = [
  { id: 'apple', name: 'Apple', category: 'fruit', price: 0.5, stock: 20 },
  { id: 'banana', name: 'Banana', category: 'fruit', price: 0.25, stock: 3 },
  { id: 'bagel', name: 'Bagel', category: 'bakery', price: 1.2, stock: 6 },
  { id: 'brioche', name: 'Brioche', category: 'bakery', price: 3.5, stock: 1 },
  { id: 'milk', name: 'Milk', category: 'dairy', price: 1.1, stock: 10 },
  { id: 'yogurt', name: 'Yogurt', category: 'dairy', price: 0.9, stock: 0 },
]

export function createFakeApi(): Api {
  const prices = new Map(seed.map(p => [p.id, p.price]))
  return {
    listProducts: () =>
      new Promise(resolve =>
        setTimeout(() => resolve(seed.map(p => ({ ...p, price: prices.get(p.id) ?? p.price }))), 300),
      ),
    subscribePrices: onUpdate => {
      const timer = setInterval(() => {
        const p = seed[Math.floor(Math.random() * seed.length)]
        const price = Math.round(p.price * (0.7 + Math.random() * 0.6) * 100) / 100
        prices.set(p.id, price)
        onUpdate({ id: p.id, price })
      }, 3000)
      return () => clearInterval(timer)
    },
  }
}
