import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Api, Product } from '../src/api'
import { App } from '../src/App'

const products: Product[] = [
  { id: 'a', name: 'Apple', category: 'fruit', price: 1, stock: 10 },
  { id: 'b', name: 'Bread', category: 'bakery', price: 2.5, stock: 10 },
]
const api: Api = { listProducts: () => Promise.resolve(structuredClone(products)), subscribePrices: () => () => {} }

test('lists products after loading', async () => {
  render(<App api={api} />)
  const list = await screen.findByRole('list', { name: 'Products' })
  expect(within(list).getAllByTestId('name').map(n => n.textContent)).toEqual(['Apple', 'Bread'])
})

test('adding updates the cart count and the cart', async () => {
  const user = userEvent.setup()
  render(<App api={api} />)
  await user.click(await screen.findByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Cart (2)' }))
  expect(screen.getByTestId('qty').textContent).toBe('2')
  expect(screen.getByTestId('total').textContent).toBe('Total: $5.00')
})

const apiWith = (list: Product[]): Api => ({ listProducts: () => Promise.resolve(structuredClone(list)), subscribePrices: () => () => {} })

test('shows "Only N left" when 3 or fewer can still be added', async () => {
  render(<App api={apiWith([
    { id: 'a', name: 'Apple', category: 'fruit', price: 1, stock: 20 },
    { id: 'b', name: 'Banana', category: 'fruit', price: 1, stock: 3 },
  ])} />)
  const list = await screen.findByRole('list', { name: 'Products' })
  const rows = within(list).getAllByRole('listitem')
  expect(within(rows[0]).queryByTestId('stock')).toBeNull()
  expect(within(rows[1]).getByTestId('stock').textContent).toBe('Only 3 left')
})

test('out of stock row disables Add; sold-out stock shows Out of stock', async () => {
  const user = userEvent.setup()
  render(<App api={apiWith([{ id: 'b', name: 'Brioche', category: 'bakery', price: 3.5, stock: 1 }])} />)
  await user.click(await screen.findByRole('button', { name: 'Add Brioche' }))
  expect(screen.getByTestId('stock').textContent).toBe('Out of stock')
  expect((screen.getByRole('button', { name: 'Add Brioche' }) as HTMLButtonElement).disabled).toBe(true)
})

test('Add cannot push the cart above stock, and Increase is disabled at stock', async () => {
  const user = userEvent.setup()
  render(<App api={apiWith([{ id: 'b', name: 'Bagel', category: 'bakery', price: 1, stock: 2 }])} />)
  await user.click(await screen.findByRole('button', { name: 'Add Bagel' }))
  await user.click(screen.getByRole('button', { name: 'Add Bagel' }))
  expect((screen.getByRole('button', { name: 'Add Bagel' }) as HTMLButtonElement).disabled).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Cart (2)' }))
  expect(screen.getByTestId('qty').textContent).toBe('2')
  expect((screen.getByRole('button', { name: 'Increase Bagel' }) as HTMLButtonElement).disabled).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Decrease Bagel' }))
  expect((screen.getByRole('button', { name: 'Increase Bagel' }) as HTMLButtonElement).disabled).toBe(false)
})

test('live price updates reach the product list, cart lines and total', async () => {
  const user = userEvent.setup()
  let push: ((u: { id: string; price: number }) => void) | undefined
  const liveApi: Api = {
    listProducts: () => Promise.resolve(structuredClone(products)),
    subscribePrices: cb => { push = cb; return () => {} },
  }
  render(<App api={liveApi} />)
  await screen.findByRole('list', { name: 'Products' })
  await user.click(screen.getByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  expect(screen.queryByTestId('price-change')).toBeNull()

  act(() => push!({ id: 'b', price: 3 }))
  expect(screen.getByTestId('price-change').textContent).toBe('Price up')
  expect(screen.getByTestId('total').textContent).toBe('Total: $3.00')

  act(() => push!({ id: 'b', price: 2.5 }))
  expect(screen.queryByTestId('price-change')).toBeNull()

  act(() => push!({ id: 'b', price: 2 }))
  expect(screen.getByTestId('price-change').textContent).toBe('Price down')

  await user.click(screen.getByRole('button', { name: 'Decrease Bread' }))
  await user.click(screen.getByRole('button', { name: 'Products' }))
  expect(within(screen.getByRole('list', { name: 'Products' })).getByText('$2.00')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Add Bread' }))
  await user.click(screen.getByRole('button', { name: 'Cart (1)' }))
  expect(screen.queryByTestId('price-change')).toBeNull()
})
