import { screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { flush, mount, run } from '#adapter'
import { App } from './src/App'

export type Product = { id: string; name: string; category: 'fruit' | 'bakery' | 'dairy'; price: number; stock: number }
type Update = { id: string; price: number }

export const seed = (): Product[] => [
  { id: 'apple', name: 'Apple', category: 'fruit', price: 0.5, stock: 20 },
  { id: 'banana', name: 'Banana', category: 'fruit', price: 0.25, stock: 3 },
  { id: 'bagel', name: 'Bagel', category: 'bakery', price: 1.2, stock: 6 },
  { id: 'brioche', name: 'Brioche', category: 'bakery', price: 3.5, stock: 1 },
  { id: 'milk', name: 'Milk', category: 'dairy', price: 1.1, stock: 10 },
  { id: 'yogurt', name: 'Yogurt', category: 'dairy', price: 0.9, stock: 0 },
]

export function fakeApi(products: Product[] = seed()) {
  const subs = new Set<(u: Update) => void>()
  const state = { maxSubs: 0 }
  const api = {
    listProducts: vi.fn(() => Promise.resolve(structuredClone(products))),
    subscribePrices: vi.fn((cb: (u: Update) => void) => {
      subs.add(cb)
      state.maxSubs = Math.max(state.maxSubs, subs.size)
      return () => { subs.delete(cb) }
    }),
  }
  const push = async (id: string, price: number) => {
    run(() => { for (const s of [...subs]) s({ id, price }) })
    await flush()
  }
  return { api, subs, state, push }
}

export async function start(products?: Product[]) {
  const fake = fakeApi(products)
  const user = userEvent.setup()
  const handle = mount(App as any, { api: fake.api })
  await screen.findByRole('list', { name: 'Products' })
  await flush()
  return { fake, user, handle }
}

export type User = ReturnType<typeof userEvent.setup>

export const productList = () => screen.getByRole('list', { name: 'Products' })
export const productNames = () => within(productList()).queryAllByTestId('name').map(n => n.textContent?.trim())
export const productRow = (name: string) =>
  within(productList()).getAllByRole('listitem').find(li => within(li).queryByTestId('name')?.textContent?.trim() === name)!
export const rowText = (name: string) => productRow(name).textContent ?? ''
export const addButton = (name: string) => screen.getByRole('button', { name: `Add ${name}` }) as HTMLButtonElement

export const cartLine = (name: string) =>
  within(screen.getByRole('list', { name: 'Cart' })).getAllByRole('listitem')
    .find(li => within(li).queryByTestId('name')?.textContent?.trim() === name)
export const lineField = (name: string, id: string) => within(cartLine(name)!).queryByTestId(id)?.textContent?.trim() ?? null
export const total = () => screen.getByTestId('total').textContent?.trim()

export const goProducts = (user: User) => user.click(screen.getByRole('button', { name: 'Products' }))
export const goCart = (user: User) => user.click(screen.getByRole('button', { name: /^Cart/ }))
export const press = (user: User, label: string) => user.click(screen.getByRole('button', { name: label }))
export async function addTimes(user: User, name: string, n: number) {
  for (let i = 0; i < n; i++) await user.click(addButton(name))
}
