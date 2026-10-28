import { screen } from '@testing-library/dom'
import { addTimes, goCart, goProducts, lineField, press, productNames, start, total } from './helpers'

test('lists every product', async () => {
  await start()
  expect([...productNames()].sort()).toEqual(['Apple', 'Bagel', 'Banana', 'Brioche', 'Milk', 'Yogurt'])
})

test('adding updates the cart count, lines and total', async () => {
  const { user } = await start()
  await addTimes(user, 'Apple', 2)
  await addTimes(user, 'Milk', 1)
  expect(screen.getByRole('button', { name: 'Cart (3)' })).toBeTruthy()
  await goCart(user)
  expect(lineField('Apple', 'qty')).toBe('2')
  expect(lineField('Apple', 'line')).toBe('$1.00')
  expect(total()).toBe('Total: $2.10')
})

test('cart increase and decrease, and removal at zero', async () => {
  const { user } = await start()
  await addTimes(user, 'Bagel', 1)
  await goCart(user)
  await press(user, 'Increase Bagel')
  expect(lineField('Bagel', 'qty')).toBe('2')
  await press(user, 'Decrease Bagel')
  await press(user, 'Decrease Bagel')
  expect(screen.queryByRole('list', { name: 'Cart' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Cart (0)' })).toBeTruthy()
})

test('switching tabs keeps the cart', async () => {
  const { user } = await start()
  await addTimes(user, 'Milk', 2)
  await goCart(user)
  await goProducts(user)
  await goCart(user)
  expect(lineField('Milk', 'qty')).toBe('2')
})
