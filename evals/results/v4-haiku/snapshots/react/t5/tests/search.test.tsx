import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

beforeEach(() => localStorage.clear())

const stocks = seedStocks(12)

type Pending = { query: string; signal: AbortSignal; resolve: (ids: string[]) => void; reject: () => void }

function setup(search?: Api['search']) {
  const requests: Pending[] = []
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]),
    subscribeQuotes: () => () => {},
    details: () => Promise.resolve({ description: 'd' }),
    setFavorite: () => Promise.resolve(),
    search: search ?? ((query, signal) => new Promise<string[]>((resolve, reject) => {
      requests.push({ query, signal, resolve, reject: () => reject(new Error('fail')) })
    })),
  }
  return { api, requests }
}

const shownIds = () => within(screen.getByRole('list', { name: 'Stocks' })).queryAllByTestId('symbol').map(n => n.textContent)
const type = (value: string) => fireEvent.change(screen.getByLabelText('Search'), { target: { value } })

test('search shows only matches, and empty text shows everything without a request', async () => {
  const { api, requests } = setup()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('  acm ')
  expect(requests.map(r => r.query)).toEqual(['acm'])
  await act(async () => requests[0].resolve(['s0', 's5']))
  expect(shownIds()).toEqual([stocks[0].symbol, stocks[5].symbol])
  expect(screen.getByTestId('count').textContent).toBe('2 stocks')
  type('')
  expect(requests).toHaveLength(1)
  expect(shownIds()).toHaveLength(12)
  expect(screen.getByTestId('count').textContent).toBe('12 stocks')
})

test('only the latest query is shown and older requests are aborted', async () => {
  const { api, requests } = setup()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('a')
  type('ab')
  expect(requests[0].signal.aborted).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('Searching…')
  await act(async () => requests[1].resolve(['s1']))
  await act(async () => requests[0].resolve(['s0', 's1', 's2']))
  expect(shownIds()).toEqual([stocks[1].symbol])
  expect(screen.queryByRole('status')).toBeNull()
})

test('a failed search shows an alert and keeps the previous results until a search succeeds', async () => {
  const { api, requests } = setup()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('x')
  await act(async () => requests[0].resolve(['s0', 's2']))
  type('y')
  await act(async () => requests[1].reject())
  expect(screen.getByRole('alert').textContent).toBe('Search failed')
  expect(shownIds()).toEqual([stocks[0].symbol, stocks[2].symbol])
  type('z')
  await act(async () => requests[2].resolve(['s3']))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(shownIds()).toEqual([stocks[3].symbol])
})

test('rows that stay after a search do not format or render again', async () => {
  const { api, requests } = setup()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const rows = within(screen.getByRole('list', { name: 'Stocks' })).getAllByRole('listitem')
  type('q')
  const before = work.calls
  await act(async () => requests[0].resolve(['s0', 's1']))
  // Only the header count changed: the two shown rows are not formatted again, and rows 0 and 1 keep their nodes.
  expect(work.calls - before).toBe(0)
  const now = within(screen.getByRole('list', { name: 'Stocks' })).getAllByRole('listitem')
  expect(now).toHaveLength(2)
  expect(now[0]).toBe(rows[0])
  expect(now[1]).toBe(rows[1])
})
