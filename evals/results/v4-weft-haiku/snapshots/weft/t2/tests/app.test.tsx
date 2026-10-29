// weft-allow T005: the watchlist's acceptance contract names data-testid values (symbol, count, portfolio)
import { screen as dom, within } from '@testing-library/dom'
import { flush, render, screen, user } from 'weft/test'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

const stocks = seedStocks(3)
let push: (q: Quote) => void = () => {}

/** Search requests the test answers by hand, in the order they were sent. */
type Request = { query: string; signal: AbortSignal; resolve: (ids: string[]) => void; reject: (e: Error) => void }
let requests: Request[] = []
const latest = () => requests[requests.length - 1]

const api: Api = {
  listStocks: () => Promise.resolve(structuredClone(stocks)),
  listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]),
  subscribeQuotes: onQuote => {
    push = onQuote
    return () => { push = () => {} }
  },
  search: (query, signal) => new Promise((resolve, reject) => { requests.push({ query, signal, resolve, reject }) }),
}

beforeEach(() => { requests = [] })

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

const rowSymbols = () => within(dom.getByRole('list', { name: 'Stocks' })).queryAllByTestId('symbol').map(n => n.textContent)
const searchBox = () => screen.getByRole('textbox', { name: 'Search' })

test('typing sends the trimmed query and shows only the matches', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(searchBox(), ' ab ')
  expect(requests.map(r => r.query)).toEqual(['a', 'ab'])
  expect(requests[0].signal.aborted).toBe(true)
  latest().resolve([stocks[1].id])
  await flush()
  expect(rowSymbols()).toEqual([stocks[1].symbol])
  expect(dom.getByTestId('count').textContent).toBe('1 stock')
})

test('an empty search shows every stock and sends no request', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(searchBox(), 'a')
  latest().resolve([stocks[0].id])
  await flush()
  await user.clear(searchBox())
  expect(requests).toHaveLength(1)
  expect(rowSymbols()).toEqual(stocks.map(s => s.symbol))
})

test('only the latest query may show results', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(searchBox(), 'a')
  const first = latest()
  await user.type(searchBox(), 'b')
  const second = latest()
  second.resolve([stocks[0].id])
  await flush()
  first.reject(new DOMException('Aborted', 'AbortError'))
  await flush()
  expect(rowSymbols()).toEqual([stocks[0].symbol])
})

test('shows Searching while pending and a failure alert that the next success clears', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(searchBox(), 'a')
  expect(dom.getByRole('status').textContent).toBe('Searching…')
  latest().resolve([stocks[0].id])
  await flush()
  expect(dom.queryByRole('status')).toBeNull()

  await user.type(searchBox(), 'b')
  latest().reject(new Error('boom'))
  await flush()
  expect(dom.getByRole('alert').textContent).toBe('Search failed')
  expect(rowSymbols()).toEqual([stocks[0].symbol])

  await user.type(searchBox(), 'c')
  latest().resolve([stocks[2].id])
  await flush()
  expect(dom.queryByRole('alert')).toBeNull()
  expect(rowSymbols()).toEqual([stocks[2].symbol])
})

test('removing rows formats nothing for the rows that stay, and quotes still reach them', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(searchBox(), 'a')
  const before = work.calls
  latest().resolve([stocks[0].id, stocks[1].id])
  await flush()
  expect(work.calls - before).toBe(0)
  expect(rowSymbols()).toEqual([stocks[0].symbol, stocks[1].symbol])
  push({ id: 's1', price: 77 })
  await flush()
  expect(within(dom.getByRole('list', { name: 'Stocks' })).getAllByTestId('price')[1].textContent).toBe('$77.00')
})
