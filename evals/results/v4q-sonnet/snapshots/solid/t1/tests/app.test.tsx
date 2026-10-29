import { render, screen, within, waitFor } from '@solidjs/testing-library'
import { work } from '../src/lib/format'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'

const stocks = seedStocks(3)
const api: Api = { listStocks: () => Promise.resolve(structuredClone(stocks)), listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]), subscribeQuotes: () => () => {} }

test('lists stocks after loading', async () => {
  render(() => <App api={api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(stocks.map(s => s.symbol))
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(screen.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * stocks[1].price).toFixed(2)}`)
})

test('live quotes update only the affected row and the portfolio', async () => {
  let push!: (q: { id: string; price: number }) => void
  let unsubs = 0
  const live: Api = { ...api, subscribeQuotes: cb => { push = cb; return () => { unsubs++ } } }
  const { unmount } = render(() => <App api={live} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  push({ id: 's1', price: 100 })
  await waitFor(() => expect(screen.getByTestId('portfolio').textContent).toBe('Portfolio: $200.00'))
  expect(work.calls - before).toBeLessThanOrEqual(4)
  expect(within(list).getAllByTestId('price')[1].textContent).toBe('$100.00')
  expect(within(list).getAllByTestId('spark')[1].querySelector('path')!.getAttribute('d')).toContain('L')
  unmount()
  expect(unsubs).toBe(1)
})
