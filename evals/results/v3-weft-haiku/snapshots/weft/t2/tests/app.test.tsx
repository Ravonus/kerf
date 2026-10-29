// weft-allow T005: the shop's acceptance contract names data-testid values (name, qty, total)
import { screen as dom, within } from '@testing-library/dom'
import { flush, render, screen, user } from 'weft/test'
import type { Api, Product } from '../src/api'
import { App } from '../src/App'

const products: Product[] = [
  { id: 'a', name: 'Apple', category: 'fruit', price: 1, stock: 10 },
  { id: 'b', name: 'Bread', category: 'bakery', price: 2.5, stock: 10 },
]
const api: Api = { listProducts: () => Promise.resolve(structuredClone(products)), subscribePrices: () => () => {} }

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
  subscribePrices: () => () => {},
})

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

function liveApi() {
  let push: ((u: { id: string; price: number }) => void) | undefined
  const api: Api = {
    listProducts: () => Promise.resolve(structuredClone(products)),
    subscribePrices: onUpdate => {
      push = onUpdate
      return () => {}
    },
  }
  const change = async (id: string, price: number) => {
    push!({ id, price })
    await flush()
  }
  return { api, change }
}

test('the product list shows the current price after a change', async () => {
  const { api, change } = liveApi()
  render(App, { api })
  await screen.findByRole('list', { name: 'Products' })
  await change('a', 1.75)
  expect(dom.getByRole('list', { name: 'Products' }).textContent).toContain('$1.75')
})

test('the cart shows Price up and Price down against the price when added, and clears when back', async () => {
  const { api, change } = liveApi()
  render(App, { api })
  await user.click(await screen.findByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  expect(dom.queryByTestId('price-change')).toBeNull()
  await change('b', 3)
  expect(dom.getByTestId('price-change').textContent).toBe('Price up')
  expect(dom.getByTestId('line').textContent).toBe('$3.00')
  expect(dom.getByTestId('total').textContent).toBe('Total: $3.00')
  await change('b', 2)
  expect(dom.getByTestId('price-change').textContent).toBe('Price down')
  await change('b', 2.5)
  expect(dom.queryByTestId('price-change')).toBeNull()
})

test('removing and re-adding a product starts fresh from the current price', async () => {
  const { api, change } = liveApi()
  render(App, { api })
  await user.click(await screen.findByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  await change('b', 3)
  await user.click(screen.getByRole('button', { name: 'Decrease Bread' }))
  expect(dom.queryByRole('list', { name: 'Cart' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Products' }))
  await user.click(screen.getByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  expect(dom.queryByTestId('price-change')).toBeNull()
})
