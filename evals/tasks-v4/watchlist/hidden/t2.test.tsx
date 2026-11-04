// weft-allow T005: the task spec names data-testid values as the contract for every framework
import { screen } from '@testing-library/dom'
import { cost, count, fakeApi, field, money, seed, start, symbols } from './helpers'

const stocks = seed()
const sym = (...ids: number[]) => ids.map((i) => stocks[i].symbol)
const box = () => screen.getByLabelText('Search') as HTMLInputElement

test('typing searches and shows only the results', async () => {
  const { fake, user } = await start()
  await user.type(box(), 'acm')
  expect(fake.searches.map((s) => s.query)).toEqual(['a', 'ac', 'acm'])
  await fake.searches[2].resolve(['s0', 's10', 's20'])
  expect(symbols()).toEqual(sym(0, 10, 20))
  expect(count()).toBe('3 stocks')
})

test('only the latest query is ever shown, whatever order responses arrive in', async () => {
  const { fake, user } = await start()
  await user.type(box(), 'b')
  await user.type(box(), 'o')
  await fake.searches[0].resolve(['s1', 's11', 's21'])
  expect(symbols()).toHaveLength(50)
  await fake.searches[1].resolve(['s1'])
  expect(symbols()).toEqual(sym(1))
  expect(count()).toBe('1 stock')
  await user.type(box(), 'l')
  await fake.searches[2].resolve(['s11'])
  await fake.searches[1].resolve(['s1', 's21'])
  expect(symbols()).toEqual(sym(11))
})

test('a superseded request is aborted', async () => {
  const { fake, user } = await start()
  await user.type(box(), 'de')
  expect(fake.searches[0].signal.aborted).toBe(true)
  expect(fake.searches[1].signal.aborted).toBe(false)
})

test('Searching… shows while the latest request is pending', async () => {
  const { fake, user } = await start()
  expect(screen.queryByText('Searching…')).toBeNull()
  await user.type(box(), 'f')
  expect(screen.getByRole('status').textContent).toContain('Searching…')
  await fake.searches[0].resolve(['s5'])
  expect(screen.queryByText('Searching…')).toBeNull()
})

test('a failed search shows an alert and keeps the previous results', async () => {
  const { fake, user } = await start()
  await user.type(box(), 'g')
  await fake.searches[0].resolve(['s6', 's16'])
  await user.type(box(), 'r')
  await fake.searches[1].reject()
  expect(screen.getByRole('alert').textContent).toContain('Search failed')
  expect(symbols()).toEqual(sym(6, 16))
  expect(screen.queryByText('Searching…')).toBeNull()
  await user.type(box(), 'o')
  await fake.searches[2].resolve(['s26'])
  expect(screen.queryByText('Search failed')).toBeNull()
  expect(symbols()).toEqual(sym(26))
})

test('clearing the search shows every stock with no request, and late responses are ignored', async () => {
  const { fake, user } = await start()
  await user.type(box(), 'h')
  await fake.searches[0].resolve(['s7'])
  await user.type(box(), 'e')
  await user.clear(box())
  expect(fake.searches).toHaveLength(2)
  expect(symbols()).toHaveLength(50)
  await fake.searches[1].resolve(['s17'])
  expect(symbols()).toHaveLength(50)
  expect(count()).toBe('50 stocks')
})

test('quotes keep updating the rows that are shown', async () => {
  const { fake, user } = await start()
  await user.type(box(), 'ion')
  await fake.searches[2].resolve(['s8', 's18'])
  await fake.push('s18', 123.45)
  expect(field(stocks[18].symbol, 'price')).toBe(money(123.45))
  await fake.push('s9', 5)
  await user.clear(box())
  expect(field(stocks[9].symbol, 'price')).toBe(money(5))
})

test('budget: a result that only removes rows does not format the rows that stay', async () => {
  const many = seed(200)
  const { fake, user } = await start(fakeApi(many))
  await user.type(box(), 'x')
  const keep = many.filter((_, i) => i % 10 === 0).map((s) => s.id)
  const narrowed = await cost(() => fake.searches[0].resolve(keep))
  expect(symbols()).toHaveLength(20)
  expect(narrowed.calls).toBeLessThanOrEqual(2)
  expect(narrowed.dom).toBeLessThanOrEqual(180 + 10)
})
