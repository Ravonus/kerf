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
