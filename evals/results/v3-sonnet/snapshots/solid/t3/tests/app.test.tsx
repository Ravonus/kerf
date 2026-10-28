import { render, screen, within } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import type { Api, Product } from '../src/api'
import { App } from '../src/App'

const products: Product[] = [
  { id: 'a', name: 'Apple', category: 'fruit', price: 1, stock: 10 },
  { id: 'b', name: 'Bread', category: 'bakery', price: 2.5, stock: 10 },
]
const api: Api = { listProducts: () => Promise.resolve(structuredClone(products)) } as Api

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

test('stock limits', async () => {
  const user = userEvent.setup()
  const lim: Api = { listProducts: () => Promise.resolve([{ id: 'x', name: 'Xylo', category: 'fruit', price: 1, stock: 2 }]) } as Api
  render(() => <App api={lim} />)
  await user.click(await screen.findByRole('button', { name: 'Add Xylo' }))
  expect(screen.getByText('Only 1 left')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Add Xylo' }))
  expect(screen.getByText('Out of stock')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Add Xylo' }) as HTMLButtonElement).disabled).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Cart (2)' }))
  expect((screen.getByRole('button', { name: 'Increase Xylo' }) as HTMLButtonElement).disabled).toBe(true)
})

test('live prices', async () => {
  const user = userEvent.setup()
  let push: (u: { id: string; price: number }) => void = () => {}
  const live: Api = {
    listProducts: () => Promise.resolve([{ id: 'x', name: 'Xylo', category: 'fruit', price: 1, stock: 5 }]),
    subscribePrices: cb => { push = cb; return () => {} },
  }
  render(() => <App api={live} />)
  await user.click(await screen.findByRole('button', { name: 'Add Xylo' }))
  push({ id: 'x', price: 2 })
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  expect(screen.getByTestId('price-change').textContent).toBe('Price up')
  expect(screen.getByTestId('total').textContent).toBe('Total: $2.00')
  push({ id: 'x', price: 1 })
  expect(screen.queryByTestId('price-change')).toBeNull()
  push({ id: 'x', price: 0.5 })
  expect(screen.getByTestId('price-change').textContent).toBe('Price down')
  await user.click(screen.getByRole('button', { name: 'Decrease Xylo' }))
  await user.click(screen.getByRole('button', { name: 'Products' }))
  await user.click(screen.getByRole('button', { name: 'Add Xylo' }))
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  expect(screen.queryByTestId('price-change')).toBeNull()
})

test('search, category, sort persist across tabs', async () => {
  const user = userEvent.setup()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Products' })
  expect(screen.getByTestId('product-count').textContent).toBe('2 products')
  await user.type(screen.getByLabelText('Search'), 'BRE')
  await user.selectOptions(screen.getByLabelText('Sort'), 'price-desc')
  expect(screen.getByTestId('product-count').textContent).toBe('1 product')
  await user.click(screen.getByRole('button', { name: 'Cart (0)' }))
  await user.click(screen.getByRole('button', { name: 'Products' }))
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('BRE')
  expect((screen.getByLabelText('Sort') as HTMLSelectElement).value).toBe('price-desc')
  await user.selectOptions(screen.getByLabelText('Category'), 'fruit')
  expect(screen.getByTestId('product-count').textContent).toBe('0 products')
})
