import { derived, state } from '@kerf/core'

export const products = [
  { name: 'Apple', category: 'fruit', price: 50, stock: 20 },
  { name: 'Banana', category: 'fruit', price: 25, stock: 3 },
  { name: 'Bagel', category: 'bakery', price: 120, stock: 6 },
  { name: 'Brioche', category: 'bakery', price: 350, stock: 1 },
  { name: 'Milk', category: 'dairy', price: 110, stock: 10 },
  { name: 'Yogurt', category: 'dairy', price: 90, stock: 0 },
]
export type Product = (typeof products)[number]
export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

export function shopState() {
  const tab = state('Products')
  const search = state('')
  const category = state('All')
  const sort = state('Name')
  const cart = state<Record<string, number>>({})
  const name = state('')
  const email = state('')
  const card = state('')
  const errors = state<string[]>([])
  const thanks = state('')
  const count = derived(() => Object.values(cart.value).reduce((a, b) => a + b, 0))
  const total = derived(() => products.reduce((n, p) => n + p.price * (cart.value[p.name] ?? 0), 0))
  const shown = derived(() =>
    products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(search.value.toLowerCase()) &&
          (category.value === 'All' || category.value === p.category),
      )
      .sort((a, b) =>
        sort.value === 'Name'
          ? a.name.localeCompare(b.name)
          : sort.value === 'Price: low to high'
            ? a.price - b.price
            : b.price - a.price,
      ),
  )
  const change = (p: Product, delta: number) => {
    const quantity = Math.max(0, Math.min(p.stock, (cart.value[p.name] ?? 0) + delta))
    cart.value = { ...cart.value, [p.name]: quantity }
  }
  const order = (event: Event) => {
    event.preventDefault()
    const bad = [
      !name.value.trim(),
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value),
      !/^\d{16}$/.test(card.value.replaceAll(' ', '')),
    ]
    errors.value = bad.map((invalid, i) =>
      invalid ? (['Enter a name', 'Enter a valid email', 'Enter 16 digits'][i] ?? '') : '',
    )
    const first = bad.indexOf(true)
    if (first >= 0)
      queueMicrotask(() => document.getElementById(['name', 'email', 'card'][first] ?? '')?.focus())
    else {
      thanks.value = name.value.trim()
      cart.value = {}
    }
  }
  return {
    tab,
    search,
    category,
    sort,
    cart,
    name,
    email,
    card,
    errors,
    thanks,
    count,
    total,
    shown,
    change,
    order,
  }
}
