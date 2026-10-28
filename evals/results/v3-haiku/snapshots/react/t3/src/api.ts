export type Category = 'fruit' | 'bakery' | 'dairy'

export type Product = { id: string; name: string; category: Category; price: number; stock: number }
export type PriceUpdate = { id: string; price: number }

export interface Api {
  listProducts(): Promise<Product[]>
  subscribePrices(onUpdate: (update: PriceUpdate) => void): () => void // returns unsubscribe
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
  // Shared between all callers so listProducts reflects prices pushed so far.
  const current: Product[] = structuredClone(seed)
  const listeners = new Set<(update: PriceUpdate) => void>()
  let timer: ReturnType<typeof setInterval> | undefined

  const tick = () => {
    const p = current[Math.floor(Math.random() * current.length)]
    const price = Math.max(0.01, Math.round(p.price * (0.8 + Math.random() * 0.4) * 100) / 100)
    p.price = price
    listeners.forEach(l => l({ id: p.id, price }))
  }

  return {
    listProducts: () => new Promise(resolve => setTimeout(() => resolve(structuredClone(current)), 300)),
    subscribePrices(onUpdate) {
      listeners.add(onUpdate)
      if (!timer) timer = setInterval(tick, 3000)
      return () => {
        listeners.delete(onUpdate)
        if (listeners.size === 0 && timer) { clearInterval(timer); timer = undefined }
      }
    },
  }
}
