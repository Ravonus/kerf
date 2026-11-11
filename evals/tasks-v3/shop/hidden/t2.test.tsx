// kerf-allow T005: the task spec names data-testid values as the contract for every framework
import { screen, within } from '@testing-library/dom'
import { addTimes, goCart, goProducts, lineField, press, productRow, start, total } from './helpers'

const rowPrice = (name: string) => within(productRow(name)).getByTestId('price').textContent?.trim()

test('product list shows pushed prices', async () => {
  const { fake } = await start()
  await fake.push('apple', 0.75)
  expect(rowPrice('Apple')).toBe('$0.75')
})

test('cart lines and total use the current price', async () => {
  const { user, fake } = await start()
  await addTimes(user, 'Apple', 2)
  await goCart(user)
  await fake.push('apple', 1)
  expect(lineField('Apple', 'line')).toBe('$2.00')
  expect(total()).toBe('Total: $2.00')
})

test('price change indicator: up, down, and back to the original', async () => {
  const { user, fake } = await start()
  await addTimes(user, 'Milk', 1)
  await goCart(user)
  expect(lineField('Milk', 'price-change')).toBeNull()
  await fake.push('milk', 1.5)
  expect(lineField('Milk', 'price-change')).toBe('Price up')
  await fake.push('milk', 0.8)
  expect(lineField('Milk', 'price-change')).toBe('Price down')
  await fake.push('milk', 1.1)
  expect(lineField('Milk', 'price-change')).toBeNull()
})

test('changes pushed while on the Products tab show up in the cart', async () => {
  const { user, fake } = await start()
  await addTimes(user, 'Bagel', 1)
  await fake.push('bagel', 2)
  await goCart(user)
  expect(lineField('Bagel', 'line')).toBe('$2.00')
  expect(lineField('Bagel', 'price-change')).toBe('Price up')
})

test('changes pushed while on the Cart tab show up in the product list', async () => {
  const { user, fake } = await start()
  await goCart(user)
  await fake.push('banana', 0.4)
  await goProducts(user)
  expect(rowPrice('Banana')).toBe('$0.40')
})

test('removing and re-adding starts fresh', async () => {
  const { user, fake } = await start()
  await addTimes(user, 'Banana', 1)
  await fake.push('banana', 0.5)
  await goCart(user)
  await press(user, 'Decrease Banana')
  await goProducts(user)
  await addTimes(user, 'Banana', 1)
  await goCart(user)
  expect(lineField('Banana', 'price-change')).toBeNull()
  expect(lineField('Banana', 'line')).toBe('$0.50')
})

test('one subscription at a time, none after unmount', async () => {
  const { user, fake, handle } = await start()
  await goCart(user)
  await goProducts(user)
  await goCart(user)
  expect(fake.subs.size).toBe(1)
  expect(fake.state.maxSubs).toBe(1)
  handle.unmount()
  expect(fake.subs.size).toBe(0)
  expect(screen.queryByRole('list')).toBeNull()
})
