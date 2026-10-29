// weft-allow T005: the watchlist's acceptance contract names data-testid values (symbol, count, portfolio)
import { screen as dom, within } from '@testing-library/dom'
import { flush, render, screen, user } from 'weft/test'; import { work } from '../src/lib/format'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'

const stocks = seedStocks(3)
const api: Api = { listStocks: () => Promise.resolve(structuredClone(stocks)), listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]), search: () => Promise.resolve([]), subscribeQuotes: () => () => {} }

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

test('quotes touch only their row', async () => {
  let push: (q: { id: string; price: number }) => void = () => {}
  const live: Api = { ...api, subscribeQuotes: cb => { push = cb; return () => {} } }
  const many = seedStocks(200)
  const big: Api = { ...live, listStocks: () => Promise.resolve(structuredClone(many)) }
  render(App, { api: big })
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  push({ id: 's5', price: 99 })
  await flush()
  expect(work.calls - before).toBeLessThanOrEqual(5)
  expect(dom.getAllByTestId('price')[5].textContent).toBe('$99.00')
  expect(dom.getAllByTestId('spark')).toHaveLength(200)
})

test('search shows latest results, removes rows only', async () => {
  const many = seedStocks(20)
  const resolvers: Record<string, (ids: string[]) => void> = {}
  const signals: Record<string, AbortSignal> = {}
  const s: Api = {
    ...api,
    listStocks: () => Promise.resolve(structuredClone(many)),
    search: (q, signal) => new Promise(res => { resolvers[q] = res; signals[q] = signal }),
  }
  render(App, { api: s })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(screen.getByLabelText('Search'), 'ab')
  expect(signals['a'].aborted).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('Searching…')
  resolvers['a'](['s1'])
  await flush()
  expect(screen.getAllByRole('listitem')).toHaveLength(20)
  const before = work.calls
  resolvers['ab'](['s1', 's2'])
  await flush()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(work.calls - before).toBe(0)
  expect(screen.queryByRole('status')).toBeNull()
})
