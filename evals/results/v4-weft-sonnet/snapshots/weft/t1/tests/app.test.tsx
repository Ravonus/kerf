// weft-allow T005: the watchlist's acceptance contract names data-testid values (symbol, count, portfolio)
import { screen as dom, within } from '@testing-library/dom'
import { flush, render, screen } from 'weft/test'; import { work } from '../src/lib/format'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'

const stocks = seedStocks(3)
const api: Api = { listStocks: () => Promise.resolve(structuredClone(stocks)), listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]), subscribeQuotes: () => () => {} }

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
