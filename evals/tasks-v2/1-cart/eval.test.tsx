import { screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { mount } from '#adapter'
import { Cart } from './solution'

const items = () => [
  { id: 'a', name: 'Apple', price: 1 },
  { id: 'b', name: 'Bread', price: 3 },
]
const rows = () => within(screen.getByRole('list', { name: 'Cart' })).queryAllByRole('listitem')
const row = (name: string) =>
  rows().find((li) => within(li).queryByTestId('name')?.textContent?.trim() === name)!
const qty = (name: string) => within(row(name)).getByTestId('qty').textContent?.trim()
const line = (name: string) => within(row(name)).getByTestId('line').textContent?.trim()
const names = () => rows().map((li) => within(li).getByTestId('name').textContent?.trim())
const total = () => screen.getByTestId('total').textContent?.trim()
const press = (user: ReturnType<typeof userEvent.setup>, label: string) =>
  user.click(screen.getByRole('button', { name: label }))

test('quantities change lines and total', async () => {
  const user = userEvent.setup()
  mount(Cart, { items: items() })
  expect(qty('Apple')).toBe('1')
  await press(user, 'Increase Apple')
  await press(user, 'Increase Apple')
  expect(qty('Apple')).toBe('3')
  expect(line('Apple')).toBe('$3.00')
  expect(total()).toBe('Total: $6.00')
})

test('decreasing at 1 removes the line', async () => {
  const user = userEvent.setup()
  mount(Cart, { items: items() })
  await press(user, 'Decrease Bread')
  expect(names()).toEqual(['Apple'])
  expect(total()).toBe('Total: $1.00')
})

test('a refresh with new prices keeps quantities and uses the new prices', async () => {
  const user = userEvent.setup()
  const h = mount(Cart, { items: items() })
  await press(user, 'Increase Bread')
  await h.setProps({
    items: [
      { id: 'a', name: 'Apple', price: 2 },
      { id: 'b', name: 'Bread', price: 4 },
    ],
  })
  expect(qty('Bread')).toBe('2')
  expect(line('Bread')).toBe('$8.00')
  expect(line('Apple')).toBe('$2.00')
  expect(total()).toBe('Total: $10.00')
})

test('a product added at the top does not shift quantities', async () => {
  const user = userEvent.setup()
  const h = mount(Cart, { items: items() })
  await press(user, 'Increase Apple')
  await press(user, 'Increase Apple')
  await h.setProps({ items: [{ id: 'c', name: 'Cheese', price: 5 }, ...items()] })
  expect(names()).toEqual(['Cheese', 'Apple', 'Bread'])
  expect(qty('Cheese')).toBe('1')
  expect(qty('Apple')).toBe('3')
  expect(qty('Bread')).toBe('1')
  expect(total()).toBe('Total: $11.00')
})

test('a reordered refresh keeps quantities with their items', async () => {
  const user = userEvent.setup()
  const h = mount(Cart, { items: items() })
  await press(user, 'Increase Bread')
  await h.setProps({ items: items().reverse() })
  expect(names()).toEqual(['Bread', 'Apple'])
  expect(qty('Bread')).toBe('2')
  expect(qty('Apple')).toBe('1')
})

test('quantities still work after a refresh', async () => {
  const user = userEvent.setup()
  const h = mount(Cart, { items: items() })
  await h.setProps({ items: items().map((i) => ({ ...i, price: i.price * 10 })) })
  await press(user, 'Increase Apple')
  expect(qty('Apple')).toBe('2')
  expect(line('Apple')).toBe('$20.00')
  expect(total()).toBe('Total: $50.00')
})
