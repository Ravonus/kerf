// kerf-allow T005: the task spec names data-testid values as the contract for every framework
import {
  calls,
  change,
  cost,
  fakeApi,
  field,
  money,
  path,
  portfolio,
  seed,
  spark,
  start,
} from './helpers'

const stocks = seed()
const [s0, s1, , s3] = stocks

test('a quote updates the row price and change', async () => {
  const { fake } = await start()
  await fake.push('s1', 99.5)
  expect(field(s1.symbol, 'price')).toBe(money(99.5))
  expect(field(s1.symbol, 'change')).toBe(change(99.5, s1.prevClose))
  expect(field(s0.symbol, 'price')).toBe(money(s0.price))
})

test('the sparkline starts at the loaded price, appends every quote and keeps the last 20', async () => {
  const { fake } = await start()
  expect(spark(s1.symbol)).toBe(path([s1.price]))
  await fake.push('s1', 50)
  await fake.push('s1', 52)
  expect(spark(s1.symbol)).toBe(path([s1.price, 50, 52]))
  const prices = Array.from({ length: 25 }, (_, i) => 40 + i)
  for (const p of prices) await fake.push('s1', p)
  expect(spark(s1.symbol)).toBe(path(prices.slice(-20)))
  expect(spark(s0.symbol)).toBe(path([s0.price]))
})

test('the portfolio value follows quotes for held stocks', async () => {
  const { fake } = await start()
  await fake.push('s3', 20)
  expect(portfolio()).toBe(`Portfolio: ${money(10 * s0.price + 5 * 20)}`)
  await fake.push('s0', 1)
  expect(portfolio()).toBe(`Portfolio: ${money(10 + 100)}`)
  await fake.push('s1', 500)
  expect(portfolio()).toBe(`Portfolio: ${money(10 + 100)}`)
})

test('one subscription for the app, closed on unmount', async () => {
  const { fake, handle } = await start()
  await fake.push('s0', 3)
  expect(fake.state.maxSubs).toBe(1)
  handle.unmount()
  expect(fake.subs.size).toBe(0)
})

test('every shown price, change and sparkline comes from the formatters', async () => {
  const before = calls()
  await start(fakeApi(seed(200)))
  expect(calls() - before).toBeGreaterThanOrEqual(3 * 200)
})

test('budget: a quote in a 200-row list formats only that row and the portfolio', async () => {
  const { fake } = await start(fakeApi(seed(200)))
  await fake.push('s150', 77)
  const held = await cost(() => fake.push('s3', 21))
  const other = await cost(() => fake.push('s120', 12))
  expect(field(seed(200)[120].symbol, 'price')).toBe(money(12))
  expect(held.calls).toBeLessThanOrEqual(4)
  expect(other.calls).toBeLessThanOrEqual(4)
  expect(held.dom).toBeLessThanOrEqual(6)
  expect(other.dom).toBeLessThanOrEqual(6)
})
