import { render, screen, within } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import type { Api, Product } from '../src/api'
import { App } from '../src/App'

const products: Product[] = [
  { id: 'a', name: 'Apple', category: 'fruit', price: 1, stock: 10 },
  { id: 'b', name: 'Bread', category: 'bakery', price: 2.5, stock: 10 },
]
const api: Api = { listProducts: () => Promise.resolve(structuredClone(products)), subscribePrices: () => () => {} } as Api

test('lists products after loading', async () => {
  render(() => <App api={api} />)
  const list = await screen.findByRole('list', { name: 'Products' })
  expect(within(list).getAllByTestId('name').map(n => n.textContent)).toEqual(['Apple', 'Bread'])
})

test('adding updates the cart count and the cart', async () => {
  const user = userEvent.setup()
  render(() => <App api={api} />)
  await user.click(await screen.findByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Cart (2)' }))
  expect(screen.getByTestId('qty').textContent).toBe('2')
  expect(screen.getByTestId('total').textContent).toBe('Total: $5.00')
})

const scarce: Product[] = [
  { id: 'c', name: 'Cheese', category: 'dairy', price: 2, stock: 5 },
  { id: 'd', name: 'Donut', category: 'bakery', price: 1, stock: 1 },
  { id: 'e', name: 'Eggs', category: 'dairy', price: 3, stock: 0 },
  { id: 'f', name: 'Figs', category: 'fruit', price: 4, stock: 10 },
]
const scarceApi: Api = { listProducts: () => Promise.resolve(structuredClone(scarce)), subscribePrices: () => () => {} } as Api

test('shows how many are left when 3 or fewer can be added', async () => {
  const user = userEvent.setup()
  render(() => <App api={scarceApi} />)
  await screen.findByRole('list', { name: 'Products' })
  const cheese = () => screen.getByRole('button', { name: 'Add Cheese' }).closest('li')!
  expect(within(cheese()).queryByTestId('stock')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Add Cheese' }))
  await user.click(screen.getByRole('button', { name: 'Add Cheese' }))
  expect(within(cheese()).getByText('Only 3 left')).toBeTruthy()
})

test('out of stock rows show a disabled Add button', async () => {
  render(() => <App api={scarceApi} />)
  await screen.findByRole('list', { name: 'Products' })
  expect(screen.getByRole('button', { name: 'Add Eggs' }).hasAttribute('disabled')).toBe(true)
  const eggs = screen.getByRole('button', { name: 'Add Eggs' }).closest('li')!
  expect(within(eggs).getByText('Out of stock')).toBeTruthy()
})

test('a product that is fully in the cart is out of stock and cannot be added again', async () => {
  const user = userEvent.setup()
  render(() => <App api={scarceApi} />)
  await user.click(await screen.findByRole('button', { name: 'Add Donut' }))
  expect(screen.getByRole('button', { name: 'Add Donut' }).hasAttribute('disabled')).toBe(true)
  const donut = screen.getByRole('button', { name: 'Add Donut' }).closest('li')!
  expect(within(donut).getByText('Out of stock')).toBeTruthy()
})

test('cart increase is disabled once the line reaches stock', async () => {
  const user = userEvent.setup()
  render(() => <App api={scarceApi} />)
  await user.click(await screen.findByRole('button', { name: 'Add Figs' }))
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  const increase = screen.getByRole('button', { name: 'Increase Figs' })
  expect(increase.hasAttribute('disabled')).toBe(false)
  for (let i = 0; i < 9; i++) await user.click(increase)
  expect(screen.getByTestId('qty').textContent).toBe('10')
  expect(increase.hasAttribute('disabled')).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Products' }))
  expect(screen.getByRole('button', { name: 'Add Figs' }).hasAttribute('disabled')).toBe(true)
})

test('live price updates reach the list, cart line and total', async () => {
  const user = userEvent.setup()
  let push: (u: { id: string; price: number }) => void = () => {}
  const live: Api = {
    listProducts: () => Promise.resolve(structuredClone(products)),
    subscribePrices: onUpdate => { push = onUpdate; return () => {} },
  }
  render(() => <App api={live} />)
  await user.click(await screen.findByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  expect(screen.queryByTestId('price-change')).toBeNull()
  push({ id: 'b', price: 3 })
  expect(screen.getByTestId('price-change').textContent).toBe('Price up')
  expect(screen.getByTestId('line').textContent).toBe('$3.00')
  expect(screen.getByTestId('total').textContent).toBe('Total: $3.00')
  push({ id: 'b', price: 2 })
  expect(screen.getByTestId('price-change').textContent).toBe('Price down')
  push({ id: 'b', price: 2.5 })
  expect(screen.queryByTestId('price-change')).toBeNull()
  expect(screen.getByTestId('total').textContent).toBe('Total: $2.50')
})

test('the product list shows the current price', async () => {
  let push: (u: { id: string; price: number }) => void = () => {}
  const live: Api = {
    listProducts: () => Promise.resolve(structuredClone(products)),
    subscribePrices: onUpdate => { push = onUpdate; return () => {} },
  }
  render(() => <App api={live} />)
  await screen.findByRole('list', { name: 'Products' })
  push({ id: 'a', price: 4 })
  expect(screen.getAllByTestId('price')[0].textContent).toBe('$4.00')
})

test('removing and re-adding a product starts a fresh price baseline', async () => {
  const user = userEvent.setup()
  let push: (u: { id: string; price: number }) => void = () => {}
  const live: Api = {
    listProducts: () => Promise.resolve(structuredClone(products)),
    subscribePrices: onUpdate => { push = onUpdate; return () => {} },
  }
  render(() => <App api={live} />)
  await user.click(await screen.findByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  push({ id: 'b', price: 3 })
  expect(screen.getByTestId('price-change').textContent).toBe('Price up')
  await user.click(screen.getByRole('button', { name: 'Decrease Bread' }))
  expect(screen.queryByRole('button', { name: 'Increase Bread' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Products' }))
  await user.click(screen.getByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  expect(screen.queryByTestId('price-change')).toBeNull()
  expect(screen.getByTestId('line').textContent).toBe('$3.00')
})

const catalog: Product[] = [
  { id: 'p1', name: 'Apple', category: 'fruit', price: 0.5, stock: 10 },
  { id: 'p2', name: 'Bagel', category: 'bakery', price: 1.2, stock: 10 },
  { id: 'p3', name: 'Pineapple', category: 'fruit', price: 3, stock: 10 },
  { id: 'p4', name: 'Milk', category: 'dairy', price: 1.1, stock: 10 },
]
const catalogApi: Api = {
  listProducts: () => Promise.resolve(structuredClone(catalog)),
  subscribePrices: () => () => {},
} as Api
const names = () => within(screen.getByRole('list', { name: 'Products' })).getAllByTestId('name').map(n => n.textContent)

test('search filters by name, case-insensitively, and the count follows', async () => {
  const user = userEvent.setup()
  render(() => <App api={catalogApi} />)
  await screen.findByRole('list', { name: 'Products' })
  expect(screen.getByTestId('product-count').textContent).toBe('4 products')
  await user.type(screen.getByLabelText('Search'), 'APPLE')
  expect(names()).toEqual(['Apple', 'Pineapple'])
  expect(screen.getByTestId('product-count').textContent).toBe('2 products')
  await user.clear(screen.getByLabelText('Search'))
  await user.type(screen.getByLabelText('Search'), 'milk')
  expect(screen.getByTestId('product-count').textContent).toBe('1 product')
})

test('category filter and sort options', async () => {
  const user = userEvent.setup()
  render(() => <App api={catalogApi} />)
  await screen.findByRole('list', { name: 'Products' })
  expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('all')
  await user.selectOptions(screen.getByLabelText('Category'), 'fruit')
  expect(names()).toEqual(['Apple', 'Pineapple'])
  await user.selectOptions(screen.getByLabelText('Sort'), 'price-desc')
  expect(names()).toEqual(['Pineapple', 'Apple'])
  await user.selectOptions(screen.getByLabelText('Category'), 'all')
  await user.selectOptions(screen.getByLabelText('Sort'), 'price-asc')
  expect(names()).toEqual(['Apple', 'Milk', 'Bagel', 'Pineapple'])
})

test('search, category and sort survive switching to the cart and back', async () => {
  const user = userEvent.setup()
  render(() => <App api={catalogApi} />)
  await screen.findByRole('list', { name: 'Products' })
  await user.type(screen.getByLabelText('Search'), 'a')
  await user.selectOptions(screen.getByLabelText('Category'), 'fruit')
  await user.selectOptions(screen.getByLabelText('Sort'), 'price-desc')
  await user.click(screen.getByRole('button', { name: 'Cart (0)' }))
  await user.click(screen.getByRole('button', { name: 'Products' }))
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('a')
  expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('fruit')
  expect((screen.getByLabelText('Sort') as HTMLSelectElement).value).toBe('price-desc')
  expect(names()).toEqual(['Pineapple', 'Apple'])
})
