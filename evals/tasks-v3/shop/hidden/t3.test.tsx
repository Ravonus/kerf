// kerf-allow T005: the task spec names data-testid values as the contract for every framework
import { screen } from '@testing-library/dom'
import { addTimes, goCart, goProducts, productNames, rowText, start } from './helpers'

const search = () => screen.getByLabelText('Search') as HTMLInputElement
const category = () => screen.getByLabelText('Category') as HTMLSelectElement
const sort = () => screen.getByLabelText('Sort') as HTMLSelectElement
const count = () => screen.getByTestId('product-count').textContent?.trim()

test('default sort is by name', async () => {
  await start()
  expect(productNames()).toEqual(['Apple', 'Bagel', 'Banana', 'Brioche', 'Milk', 'Yogurt'])
  expect(count()).toBe('6 products')
})

test('search is case-insensitive and updates the count', async () => {
  const { user } = await start()
  await user.type(search(), 'B')
  expect(productNames()).toEqual(['Bagel', 'Banana', 'Brioche'])
  expect(count()).toBe('3 products')
  await user.type(search(), 'ag')
  expect(productNames()).toEqual(['Bagel'])
  expect(count()).toBe('1 product')
})

test('category combines with search', async () => {
  const { user } = await start()
  await user.selectOptions(category(), 'fruit')
  expect(productNames()).toEqual(['Apple', 'Banana'])
  await user.type(search(), 'ban')
  expect(productNames()).toEqual(['Banana'])
  await user.selectOptions(category(), 'dairy')
  expect(productNames()).toEqual([])
  expect(count()).toBe('0 products')
})

test('sort by price both ways', async () => {
  const { user } = await start()
  await user.selectOptions(sort(), 'price-asc')
  expect(productNames()).toEqual(['Banana', 'Apple', 'Yogurt', 'Milk', 'Bagel', 'Brioche'])
  await user.selectOptions(sort(), 'price-desc')
  expect(productNames()).toEqual(['Brioche', 'Bagel', 'Milk', 'Yogurt', 'Apple', 'Banana'])
})

test('search, category and sort survive a trip to the cart', async () => {
  const { user } = await start()
  await user.type(search(), 'a')
  await user.selectOptions(category(), 'fruit')
  await user.selectOptions(sort(), 'price-desc')
  await goCart(user)
  await goProducts(user)
  expect(search().value).toBe('a')
  expect(category().value).toBe('fruit')
  expect(sort().value).toBe('price-desc')
  expect(productNames()).toEqual(['Apple', 'Banana'])
})

test('price sort follows live prices', async () => {
  const { user, fake } = await start()
  await user.selectOptions(sort(), 'price-asc')
  await fake.push('banana', 9)
  expect(productNames()).toEqual(['Apple', 'Yogurt', 'Milk', 'Bagel', 'Brioche', 'Banana'])
})

test('stock limits still apply to filtered rows', async () => {
  const { user } = await start()
  await user.type(search(), 'ban')
  await addTimes(user, 'Banana', 3)
  expect(rowText('Banana')).toContain('Out of stock')
  await goCart(user)
  await goProducts(user)
  expect(productNames()).toEqual(['Banana'])
})
