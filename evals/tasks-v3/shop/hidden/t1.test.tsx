import { addButton, addTimes, goCart, goProducts, lineField, press, rowText, start } from './helpers'
import { screen } from '@testing-library/dom'

const increase = (name: string) => screen.getByRole('button', { name: `Increase ${name}` }) as HTMLButtonElement

test('low stock shows how many more can be added', async () => {
  const { user } = await start()
  expect(rowText('Banana')).toContain('Only 3 left')
  await addTimes(user, 'Banana', 1)
  expect(rowText('Banana')).toContain('Only 2 left')
  expect(rowText('Apple')).not.toMatch(/Only \d+ left|Out of stock/)
})

test('reaching stock disables Add and shows Out of stock', async () => {
  const { user } = await start()
  await addTimes(user, 'Banana', 3)
  expect(rowText('Banana')).toContain('Out of stock')
  expect(rowText('Banana')).not.toMatch(/Only \d+ left/)
  expect(addButton('Banana').disabled).toBe(true)
  await user.click(addButton('Banana'))
  await goCart(user)
  expect(lineField('Banana', 'qty')).toBe('3')
})

test('zero stock is out of stock from the start', async () => {
  await start()
  expect(rowText('Yogurt')).toContain('Out of stock')
  expect(addButton('Yogurt').disabled).toBe(true)
})

test('cart Increase stops at stock', async () => {
  const { user } = await start()
  await addTimes(user, 'Bagel', 1)
  await goCart(user)
  for (let i = 0; i < 5; i++) await press(user, 'Increase Bagel')
  expect(lineField('Bagel', 'qty')).toBe('6')
  expect(increase('Bagel').disabled).toBe(true)
  await user.click(increase('Bagel'))
  expect(lineField('Bagel', 'qty')).toBe('6')
  await goProducts(user)
  expect(rowText('Bagel')).toContain('Out of stock')
})

test('removing from the cart makes stock available again', async () => {
  const { user } = await start()
  await addTimes(user, 'Brioche', 1)
  expect(addButton('Brioche').disabled).toBe(true)
  await goCart(user)
  await press(user, 'Decrease Brioche')
  await goProducts(user)
  expect(addButton('Brioche').disabled).toBe(false)
  expect(rowText('Brioche')).toContain('Only 1 left')
})
