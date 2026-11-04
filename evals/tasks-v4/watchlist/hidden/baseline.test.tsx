// weft-allow T005: the task spec names data-testid values as the contract for every framework
import {
  calls,
  change,
  count,
  field,
  fakeApi,
  money,
  portfolio,
  seed,
  start,
  symbols,
} from './helpers'

const stocks = seed()

test('lists every stock in order with its count', async () => {
  await start()
  expect(symbols()).toEqual(stocks.map((s) => s.symbol))
  expect(count()).toBe('50 stocks')
})

test('rows show price and change versus the previous close', async () => {
  await start()
  for (const s of [stocks[0], stocks[7], stocks[33]]) {
    expect(field(s.symbol, 'price')).toBe(money(s.price))
    expect(field(s.symbol, 'change')).toBe(change(s.price, s.prevClose))
  }
})

test('the header shows the portfolio value', async () => {
  await start()
  expect(portfolio()).toBe(`Portfolio: ${money(10 * stocks[0].price + 5 * stocks[3].price)}`)
})

test('every shown price and change comes from the formatters', async () => {
  const before = calls()
  await start(fakeApi(seed(200)))
  expect(calls() - before).toBeGreaterThanOrEqual(2 * 200)
})
