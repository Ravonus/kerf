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

const scarce: Product[] = [
  { id: 'c', name: 'Cheese', category: 'dairy', price: 2, stock: 5 },
  { id: 'd', name: 'Donut', category: 'bakery', price: 1, stock: 1 },
  { id: 'e', name: 'Eggs', category: 'dairy', price: 3, stock: 0 },
  { id: 'f', name: 'Figs', category: 'fruit', price: 4, stock: 10 },
]
const scarceApi: Api = { listProducts: () => Promise.resolve(structuredClone(scarce)) } as Api

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
