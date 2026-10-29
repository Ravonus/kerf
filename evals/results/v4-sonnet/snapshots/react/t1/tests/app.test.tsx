import { render, screen, within } from '@testing-library/react'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'

const stocks = seedStocks(3)
const api: Api = { listStocks: () => Promise.resolve(structuredClone(stocks)), listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]), subscribeQuotes: () => () => {} }

test('lists stocks after loading', async () => {
  render(<App api={api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(stocks.map(s => s.symbol))
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(screen.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * stocks[1].price).toFixed(2)}`)
})

test('live quotes update only the affected row', async () => {
  const { act } = await import('@testing-library/react')
  const { work } = await import('../src/lib/format')
  let push!: (q: { id: string; price: number }) => void
  const unsub = vi.fn()
  const live: Api = { ...api, subscribeQuotes: cb => { push = cb; return unsub } }
  const { unmount } = render(<App api={live} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  act(() => push({ id: 's1', price: 50 }))
  expect(work.calls - before).toBe(4) // price, change, sparkline, portfolio
  expect(screen.getByTestId('portfolio').textContent).toBe('Portfolio: $100.00')
  expect(screen.getAllByTestId('spark')).toHaveLength(3)
  unmount()
  expect(unsub).toHaveBeenCalledTimes(1)
})
