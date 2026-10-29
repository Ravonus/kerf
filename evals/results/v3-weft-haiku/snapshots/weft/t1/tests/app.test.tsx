// weft-allow T005: the shop's acceptance contract names data-testid values (name, qty, total)
import { screen as dom, within } from '@testing-library/dom'
import { render, screen, user } from 'weft/test'
import type { Api, Product } from '../src/api'
import { App } from '../src/App'

const products: Product[] = [
  { id: 'a', name: 'Apple', category: 'fruit', price: 1, stock: 10 },
  { id: 'b', name: 'Bread', category: 'bakery', price: 2.5, stock: 10 },
]
const api: Api = { listProducts: () => Promise.resolve(structuredClone(products)) } as Api

test('lists products after loading', async () => {
  render(App, { api })
  const list = await screen.findByRole('list', { name: 'Products' })
  expect(within(list).getAllByTestId('name').map(n => n.textContent)).toEqual(['Apple', 'Bread'])
})

test('adding updates the cart count and the cart', async () => {
  render(App, { api })
  await user.click(await screen.findByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Cart (2)' }))
  expect(dom.getByTestId('qty').textContent).toBe('2')
  expect(dom.getByTestId('total').textContent).toBe('Total: $5.00')
})

const limited = (stock: number): Api => ({
  listProducts: () => Promise.resolve([{ id: 'c', name: 'Croissant', category: 'bakery', price: 2, stock }]),
} as Api)

test('shows how many are left when 3 or fewer can still be added', async () => {
  render(App, { api: limited(3) })
  await screen.findByRole('list', { name: 'Products' })
  expect(dom.getByTestId('stock').textContent).toBe('Only 3 left')
  expect(dom.getByRole('button', { name: 'Add Croissant' }).hasAttribute('disabled')).toBe(false)
})

test('shows nothing about stock when more than 3 can be added', async () => {
  render(App, { api: limited(4) })
  await screen.findByRole('list', { name: 'Products' })
  expect(dom.queryByTestId('stock')).toBeNull()
})

test('stops adding at stock: Out of stock and a disabled Add button', async () => {
  render(App, { api: limited(2) })
  await user.click(await screen.findByRole('button', { name: 'Add Croissant' }))
  expect(dom.getByTestId('stock').textContent).toBe('Only 1 left')
  await user.click(screen.getByRole('button', { name: 'Add Croissant' }))
  expect(dom.getByTestId('stock').textContent).toBe('Out of stock')
  expect(dom.getByRole('button', { name: 'Add Croissant' }).hasAttribute('disabled')).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Cart (2)' }))
  expect(dom.getByTestId('qty').textContent).toBe('2')
})

test('a product with no stock is out of stock from the start', async () => {
  render(App, { api: limited(0) })
  await screen.findByRole('list', { name: 'Products' })
  expect(dom.getByTestId('stock').textContent).toBe('Out of stock')
  expect(dom.getByRole('button', { name: 'Add Croissant' }).hasAttribute('disabled')).toBe(true)
})

test('the cart Increase button is disabled once the line reaches stock', async () => {
  render(App, { api: limited(2) })
  await user.click(await screen.findByRole('button', { name: 'Add Croissant' }))
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  const increase = dom.getByRole('button', { name: 'Increase Croissant' })
  expect(increase.hasAttribute('disabled')).toBe(false)
  await user.click(increase)
  expect(dom.getByTestId('qty').textContent).toBe('2')
  expect(dom.getByRole('button', { name: 'Increase Croissant' }).hasAttribute('disabled')).toBe(true)
  await user.click(dom.getByRole('button', { name: 'Decrease Croissant' }))
  expect(dom.getByRole('button', { name: 'Increase Croissant' }).hasAttribute('disabled')).toBe(false)
})
