// weft-allow T005: the watchlist's acceptance contract names data-testid values (symbol, count, portfolio)
import { screen as dom, within } from '@testing-library/dom'
import { flush, render, screen } from 'weft/test'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { money, pct, sparkline, work } from '../src/lib/format'

/** A fake API whose quote feed the test drives by hand. */
function fakeApi(n: number, holdings = [{ id: 's1', qty: 2 }]) {
  const stocks = seedStocks(n)
  const listeners = new Set<(q: Quote) => void>()
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve(structuredClone(holdings)),
    subscribeQuotes(onQuote) {
      listeners.add(onQuote)
      return () => listeners.delete(onQuote)
    },
  }
  return {
    api,
    stocks,
    push: (q: Quote) => { for (const l of listeners) l(q) },
    subscribers: () => listeners.size,
  }
}

async function rowsOf(n: number) {
  const list = await screen.findByRole('list', { name: 'Stocks' })
  return within(list).getAllByRole('listitem')
}

test('lists stocks after loading', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(feed.stocks.map(s => s.symbol))
  expect(dom.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await screen.findByRole('list', { name: 'Stocks' })
  expect(dom.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * feed.stocks[1].price).toFixed(2)}`)
})

test('a quote updates the price, the change and the sparkline of its row', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  const [, row] = await rowsOf(3)
  const s = feed.stocks[1]
  feed.push({ id: s.id, price: 50 })
  await flush()
  expect(within(row).getByTestId('price').textContent).toBe(money(50))
  expect(within(row).getByTestId('change').textContent).toBe(pct(((50 - s.prevClose) / s.prevClose) * 100))
  expect(within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')).toBe(sparkline([s.price, 50]))
})

test('the sparkline keeps the last 20 prices, oldest first', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  const [, row] = await rowsOf(3)
  const s = feed.stocks[1]
  const prices = Array.from({ length: 25 }, (_, i) => 10 + i)
  for (const price of prices) feed.push({ id: s.id, price })
  await flush()
  expect(within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')).toBe(sparkline(prices.slice(-20)))
})

test('the portfolio value follows current prices', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  feed.push({ id: 's1', price: 50 })
  await flush()
  expect(dom.getByTestId('portfolio').textContent).toBe(`Portfolio: ${money(100)}`)
})

test('a quote re-formats only its own row', async () => {
  const feed = fakeApi(200)
  render(App, { api: feed.api })
  await rowsOf(200)
  const before = work.calls
  feed.push({ id: 's100', price: 42 })
  await flush()
  expect(work.calls - before).toBe(3)
})

test('the subscription is closed when the app unmounts', async () => {
  const feed = fakeApi(3)
  const { unmount } = render(App, { api: feed.api })
  await rowsOf(3)
  expect(feed.subscribers()).toBe(1)
  unmount()
  expect(feed.subscribers()).toBe(0)
})
