// weft-allow T005: the watchlist's acceptance contract names data-testid values (symbol, count, portfolio)
import { screen as dom, within } from '@testing-library/dom'
import { flush, render, screen } from 'weft/test'
import { seedStocks, type Api } from '../src/api'
import { work } from '../src/lib/format'
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

test('live quotes update price, sparkline and portfolio, and unsubscribe on unmount', async () => {
  let push: (q: { id: string; price: number }) => void = () => {}
  let subs = 0
  let unsubs = 0
  const live: Api = {
    ...api,
    subscribeQuotes: cb => { subs++; push = cb; return () => { unsubs++ } },
  }
  const view = render(App, { api: live })
  await screen.findByRole('list', { name: 'Stocks' })
  push({ id: 's1', price: 100 })
  push({ id: 's1', price: 110 })
  await flush()
  const row = dom.getAllByTestId('symbol')[1].parentElement!
  expect(within(row).getByTestId('price').textContent).toBe('$110.00')
  expect(within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')).toContain('M0.0,')
  expect(dom.getByTestId('portfolio').textContent).toBe('Portfolio: $220.00')
  const before = work.calls
  push({ id: 's2', price: 50 })
  await flush()
  expect(work.calls - before).toBe(3)
  expect(subs).toBe(1)
  view.unmount()
  expect(unsubs).toBe(1)
})
