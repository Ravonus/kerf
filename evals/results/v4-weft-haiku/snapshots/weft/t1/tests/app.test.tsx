// weft-allow T005: the watchlist's acceptance contract names data-testid values (symbol, count, portfolio)
import { screen as dom, within } from '@testing-library/dom'
import { flush, render, screen } from 'weft/test'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

const stocks = seedStocks(3)
let push: (q: Quote) => void = () => {}
const api: Api = {
  listStocks: () => Promise.resolve(structuredClone(stocks)),
  listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]),
  subscribeQuotes: onQuote => {
    push = onQuote
    return () => { push = () => {} }
  },
}

test('lists stocks after loading', async () => {
  render(App, { api })
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(stocks.map(s => s.symbol))
  expect(dom.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  expect(dom.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * stocks[1].price).toFixed(2)}`)
})

test('a quote updates that row and the portfolio value', async () => {
  render(App, { api })
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const row = within(list).getAllByRole('listitem')[1]
  push({ id: 's1', price: 100 })
  await flush()
  expect(within(row).getByTestId('price').textContent).toBe('$100.00')
  expect(within(row).getByTestId('change').textContent).toBe(`+${(((100 - stocks[1].prevClose) / stocks[1].prevClose) * 100).toFixed(2)}%`)
  expect(dom.getByTestId('portfolio').textContent).toBe('Portfolio: $200.00')
})

test('the sparkline starts at the loaded price and keeps the last 20 prices', async () => {
  render(App, { api })
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const row = within(list).getAllByRole('listitem')[0]
  const points = () => within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')!.split(' ').length
  expect(points()).toBe(1)
  for (let i = 1; i <= 25; i++) push({ id: 's0', price: 10 + i })
  await flush()
  expect(points()).toBe(20)
})

test('a quote re-renders only its row and the portfolio, formatting only those', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  push({ id: 's0', price: 42 })
  await flush()
  // price, change and sparkline for the row; no portfolio change, so no header format
  expect(work.calls - before).toBe(3)
})

test('a quote touches only its row and the portfolio in the DOM', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await expect(() => push({ id: 's0', price: 43 })).toTouchAtMost(6, { runs: 8 })
})
