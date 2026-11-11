// kerf-allow T005: the task spec names data-testid values as the contract for every framework
import { screen } from '@testing-library/dom'
import {
  cost,
  fakeApi,
  field,
  money,
  path,
  portfolio,
  seed,
  spark,
  start,
  symbols,
  type Stock,
  type User,
} from './helpers'

const stocks = seed()
const sortBox = () => screen.getByLabelText('Sort') as HTMLSelectElement
const sortBy = (user: User, value: string) => user.selectOptions(sortBox(), value)
const byChange = (list: Stock[], price: (s: Stock) => number = (s) => s.price) =>
  list
    .map((s, i) => ({ s, i, c: (price(s) - s.prevClose) / s.prevClose }))
    .sort((a, b) => b.c - a.c || a.i - b.i)
    .map((x) => x.s.symbol)

test('a burst updates every quoted row, the sparklines and the portfolio', async () => {
  const { fake } = await start()
  await fake.burst([
    ['s1', 11],
    ['s2', 22],
    ['s3', 33],
    ['s1', 12],
    ['s0', 4],
  ])
  expect(field(stocks[1].symbol, 'price')).toBe(money(12))
  expect(spark(stocks[1].symbol)).toBe(path([stocks[1].price, 11, 12]))
  expect(field(stocks[2].symbol, 'price')).toBe(money(22))
  expect(portfolio()).toBe(`Portfolio: ${money(10 * 4 + 5 * 33)}`)
})

test('budget: a burst formats each changed row once and the portfolio at most once', async () => {
  const many = seed(200)
  const { fake } = await start(fakeApi(many))
  const quotes: Array<[string, number]> = many.slice(0, 40).map((s, i) => [s.id, 20 + i])
  const c = await cost(() => fake.burst(quotes))
  expect(field(many[39].symbol, 'price')).toBe(money(59))
  expect(c.calls).toBeLessThanOrEqual(40 * 3 + 1)
  expect(c.dom).toBeLessThanOrEqual(40 * 3 + 1 + 4)
})

test('Sort by Change orders by biggest gain, ties in list order', async () => {
  const { user } = await start()
  expect(sortBox().value).toBe('symbol')
  await sortBy(user, 'change')
  expect(symbols()).toEqual(byChange(stocks))
  await sortBy(user, 'symbol')
  expect(symbols()).toEqual(stocks.map((s) => s.symbol))
})

test('with Change selected, the order follows quotes', async () => {
  const { fake, user } = await start()
  await sortBy(user, 'change')
  await fake.burst([
    ['s7', stocks[7].prevClose * 3],
    ['s8', stocks[8].prevClose * 0.2],
  ])
  const prices: Record<string, number> = {
    s7: stocks[7].prevClose * 3,
    s8: stocks[8].prevClose * 0.2,
  }
  expect(symbols()).toEqual(byChange(stocks, (s) => prices[s.id] ?? s.price))
  expect(symbols()[0]).toBe(stocks[7].symbol)
  expect(symbols().at(-1)).toBe(stocks[8].symbol)
})

test('Sort combines with search and Favorites only, and survives a reload', async () => {
  const first = await start()
  await sortBy(first.user, 'change')
  await first.user.type(screen.getByLabelText('Search'), 'q')
  await first.fake.searches[0].resolve(['s0', 's1', 's9', 's18', 's27'])
  await first.user.click(screen.getByLabelText('Favorites only'))
  const favs = [stocks[0], stocks[9], stocks[18], stocks[27]]
  expect(symbols()).toEqual(byChange(favs))
  first.handle.unmount()
  const { fake } = await start()
  expect(sortBox().value).toBe('change')
  await fake.searches[0].resolve(['s0', 's1', 's9', 's18', 's27'])
  expect(symbols()).toEqual(byChange(favs))
})

test('budget: changing the sort only moves rows', async () => {
  const { user } = await start(fakeApi(seed(200)))
  const c = await cost(() => sortBy(user, 'change'))
  expect(symbols()).toEqual(byChange(seed(200)))
  expect(c.calls).toBeLessThanOrEqual(2)
})
