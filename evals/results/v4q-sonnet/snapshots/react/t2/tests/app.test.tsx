import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'

const stocks = seedStocks(3)
const api: Api = { listStocks: () => Promise.resolve(structuredClone(stocks)), listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]), subscribeQuotes: () => () => {}, search: () => Promise.resolve([]) }

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

test('live quotes update rows, sparkline and portfolio; unsubscribes on unmount', async () => {
  let push!: (q: { id: string; price: number }) => void
  const unsub = vi.fn()
  const live: Api = { ...api, subscribeQuotes: cb => { push = cb; return unsub } }
  const { unmount } = render(<App api={live} />)
  await screen.findByRole('list', { name: 'Stocks' })
  act(() => push({ id: 's1', price: 50 }))
  expect(screen.getByTestId('portfolio').textContent).toBe('Portfolio: $100.00')
  expect(screen.getAllByTestId('price')[1].textContent).toBe('$50.00')
  expect(screen.getAllByTestId('spark')[1].querySelector('path')!.getAttribute('d')).toMatch(/^M0\.0,/)
  unmount()
  expect(unsub).toHaveBeenCalledTimes(1)
})

test('search shows only the latest query results and handles failure', async () => {
  const calls: { q: string; signal: AbortSignal; resolve: (ids: string[]) => void; reject: (e: unknown) => void }[] = []
  const searchApi: Api = {
    ...api,
    search: (q, signal) => new Promise((resolve, reject) => { calls.push({ q, signal, resolve, reject }) }),
  }
  render(<App api={searchApi} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const input = screen.getByLabelText('Search')
  fireEvent.change(input, { target: { value: 'a' } })
  fireEvent.change(input, { target: { value: 'ab ' } })
  expect(calls.map(c => c.q)).toEqual(['a', 'ab'])
  expect(calls[0].signal.aborted).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('Searching…')
  await act(async () => { calls[0].resolve(['s0']) })
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
  await act(async () => { calls[1].resolve(['s2']) })
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.change(input, { target: { value: 'x' } })
  await act(async () => { calls[2].reject(new Error('x')) })
  expect(screen.getByRole('alert').textContent).toBe('Search failed')
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
  fireEvent.change(input, { target: { value: '' } })
  expect(calls).toHaveLength(3)
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
})
