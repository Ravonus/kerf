// weft-allow T005: the task spec names data-testid values as the contract for every framework
import { screen, within } from '@testing-library/dom'
import { cost, fakeApi, money, seed, start, type User } from './helpers'

const stocks = seed()
const open = (user: User, i: number) => user.click(screen.getByRole('button', { name: `Details ${stocks[i].symbol}` }))
const panel = () => screen.getByRole('region', { name: 'Details' })
const notes = () => within(panel()).getByLabelText('Notes') as HTMLTextAreaElement
const button = (name: string) => within(panel()).getByRole('button', { name }) as HTMLButtonElement

test('the panel shows the heading, the live price and the loaded description', async () => {
  const { fake, user } = await start()
  await open(user, 2)
  expect(within(panel()).getByRole('heading').textContent).toContain(stocks[2].symbol)
  expect(within(panel()).getByRole('heading').textContent).toContain(stocks[2].name)
  expect(within(panel()).getByTestId('detail-price').textContent?.trim()).toBe(money(stocks[2].price))
  expect(within(panel()).getByText('Loading…')).toBeTruthy()
  expect(fake.details.map(d => d.id)).toEqual(['s2'])
  await fake.details[0].resolve({ description: 'Makes cedar things.' })
  expect(within(panel()).getByText('Makes cedar things.')).toBeTruthy()
  expect(within(panel()).queryByText('Loading…')).toBeNull()
})

test('the panel price stays live', async () => {
  const { fake, user } = await start()
  await open(user, 2)
  await fake.push('s2', 64.25)
  expect(within(panel()).getByTestId('detail-price').textContent?.trim()).toBe(money(64.25))
})

test('a failed load shows an alert, and Retry loads again', async () => {
  const { fake, user } = await start()
  await open(user, 5)
  await fake.details[0].reject()
  expect(within(panel()).getByRole('alert').textContent).toContain("Couldn't load details")
  await user.click(button('Retry'))
  expect(fake.details.map(d => d.id)).toEqual(['s5', 's5'])
  expect(within(panel()).getByText('Loading…')).toBeTruthy()
  await fake.details[1].resolve({ description: 'Flux it is.' })
  expect(within(panel()).getByText('Flux it is.')).toBeTruthy()
  expect(within(panel()).queryByRole('alert')).toBeNull()
})

test('a late description for a stock that is no longer open is never shown', async () => {
  const { fake, user } = await start()
  await open(user, 1)
  await open(user, 3)
  expect(within(panel()).getByRole('heading').textContent).toContain(stocks[3].symbol)
  await fake.details[1].resolve({ description: 'Delta.' })
  await fake.details[0].resolve({ description: 'Bolt.' })
  expect(within(panel()).getByText('Delta.')).toBeTruthy()
  expect(within(panel()).queryByText('Bolt.')).toBeNull()
  await open(user, 1)
  expect(within(panel()).queryByText('Bolt.')).toBeNull()
})

test('focus moves to Notes when the panel opens, and Escape closes it and returns focus', async () => {
  const { user } = await start()
  await open(user, 4)
  expect(document.activeElement).toBe(notes())
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('region', { name: 'Details' })).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: `Details ${stocks[4].symbol}` }))
})

test('notes are saved per stock and shown when that stock opens', async () => {
  const { user } = await start()
  await open(user, 0)
  await user.type(notes(), 'buy more')
  await user.click(button('Save'))
  await open(user, 1)
  expect(notes().value).toBe('')
  await user.type(notes(), 'draft only')
  await open(user, 0)
  expect(notes().value).toBe('buy more')
  await open(user, 1)
  expect(notes().value).toBe('')
})

test('Undo undoes saves one at a time, across stocks', async () => {
  const { user } = await start()
  await open(user, 0)
  expect(button('Undo').disabled).toBe(true)
  await user.type(notes(), 'a1')
  await user.click(button('Save'))
  await user.type(notes(), '-a2')
  await user.click(button('Save'))
  await open(user, 1)
  await user.type(notes(), 'b1')
  await user.click(button('Save'))
  await user.click(button('Undo'))
  expect(notes().value).toBe('')
  await open(user, 0)
  expect(notes().value).toBe('a1-a2')
  await user.click(button('Undo'))
  expect(notes().value).toBe('a1')
  await user.click(button('Undo'))
  expect(notes().value).toBe('')
  expect(button('Undo').disabled).toBe(true)
})

test('budget: typing in Notes formats no row, and a quote for the open stock stays small', async () => {
  const { fake, user } = await start(fakeApi(seed(200)))
  await user.click(screen.getByRole('button', { name: `Details ${seed(200)[60].symbol}` }))
  await fake.details[0].resolve({ description: 'x' })
  const typing = await cost(() => user.type(notes(), 'hello'))
  expect(typing.calls).toBeLessThanOrEqual(5)
  expect(typing.dom).toBeLessThanOrEqual(10)
  const quote = await cost(() => fake.push('s60', 42))
  expect(quote.calls).toBeLessThanOrEqual(5)
  expect(quote.dom).toBeLessThanOrEqual(7)
})
