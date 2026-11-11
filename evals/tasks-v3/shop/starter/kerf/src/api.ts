export type Category = 'fruit' | 'bakery' | 'dairy'

export type Product = { id: string; name: string; category: Category; price: number; stock: number }

export interface Api {
  listProducts(): Promise<Product[]>
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
  return {
    listProducts: () =>
      new Promise((resolve) => setTimeout(() => resolve(structuredClone(seed)), 300)),
  }
}
