import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { seedStocks, type Api, type QuoteUpdate } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

const stocks = seedStocks(3)

function fakeApi(holdings = [{ id: 's1', qty: 2 }]) {
  const listeners = new Set<(q: QuoteUpdate) => void>()
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve(holdings),
    search: vi.fn(() => Promise.resolve(stocks.map(s => s.id))),
    subscribeQuotes: vi.fn((onQuote: (q: QuoteUpdate) => void) => {
      listeners.add(onQuote)
      return () => { listeners.delete(onQuote) }
    }),
  }
  const push = (quote: QuoteUpdate) => act(() => listeners.forEach(l => l(quote)))
  return { api, push, listeners }
}

test('lists stocks after loading', async () => {
  render(<App api={fakeApi().api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(stocks.map(s => s.symbol))
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  render(<App api={fakeApi().api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(screen.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * stocks[1].price).toFixed(2)}`)
})

test('quotes update price, change and sparkline, and the portfolio', async () => {
  const { api, push } = fakeApi()
  render(<App api={api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const row = within(list).getAllByRole('listitem')[1]
  push({ id: stocks[1].id, price: 99.5 })
  expect(within(row).getByTestId('price').textContent).toBe('$99.50')
  expect(within(row).getByTestId('change').textContent).toBe(`+${(((99.5 - stocks[1].prevClose) / stocks[1].prevClose) * 100).toFixed(2)}%`)
  expect(within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')).toMatch(/^M0\.0,/)
  expect(screen.getByTestId('portfolio').textContent).toBe('Portfolio: $199.00')
})

test('sparkline keeps the last 20 prices, starting with the loaded price', async () => {
  const { api, push } = fakeApi()
  render(<App api={api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const path = () => within(within(list).getAllByRole('listitem')[0]).getByTestId('spark').querySelector('path')!.getAttribute('d')
  const before = path()
  for (let i = 0; i < 25; i++) push({ id: stocks[0].id, price: stocks[0].price + i })
  // 20 points: the path has 20 "L"/"M" segments.
  expect(path()!.split(' ')).toHaveLength(20)
  expect(path()).not.toBe(before)
})

test('subscribes once and unsubscribes on unmount', async () => {
  const { api, listeners } = fakeApi()
  const { unmount } = render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(api.subscribeQuotes).toHaveBeenCalledTimes(1)
  expect(listeners.size).toBe(1)
  unmount()
  expect(listeners.size).toBe(0)
})

test('a quote re-renders only its own row, so formatter work stays small', async () => {
  const { api, push } = fakeApi()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  push({ id: stocks[2].id, price: 50 })
  // One row: money + pct + sparkline. The portfolio does not change for a non-held stock.
  expect(work.calls - before).toBe(3)
})

type Pending = { query: string; signal: AbortSignal; resolve: (ids: string[]) => void; reject: (e: unknown) => void }

function controlledSearch() {
  const requests: Pending[] = []
  const search = vi.fn((query: string, signal: AbortSignal) =>
    new Promise<string[]>((resolve, reject) => { requests.push({ query, signal, resolve, reject }) }))
  return { search, requests }
}

async function typeInSearch(text: string) {
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: text } })
}

function shownSymbols() {
  return within(screen.getByRole('list', { name: 'Stocks' })).queryAllByTestId('symbol').map(n => n.textContent)
}

test('search sends the trimmed query and shows only the returned stocks', async () => {
  const { api } = fakeApi()
  const { search, requests } = controlledSearch()
  api.search = search
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  await typeInSearch('  ac ')
  expect(search).toHaveBeenCalledTimes(1)
  expect(requests[0].query).toBe('ac')
  expect(screen.getByRole('status').textContent).toBe('Searching…')
  await act(async () => requests[0].resolve([stocks[2].id]))
  expect(shownSymbols()).toEqual([stocks[2].symbol])
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
  expect(screen.queryByRole('status')).toBeNull()
})

test('empty search shows every stock and sends no request', async () => {
  const { api } = fakeApi()
  const { search, requests } = controlledSearch()
  api.search = search
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  await typeInSearch('   ')
  expect(search).not.toHaveBeenCalled()
  expect(shownSymbols()).toHaveLength(stocks.length)
  expect(requests).toHaveLength(0)
})

test('an older response never replaces the latest one, and older requests are aborted', async () => {
  const { api } = fakeApi()
  const { search, requests } = controlledSearch()
  api.search = search
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  await typeInSearch('a')
  await typeInSearch('ab')
  expect(requests[0].signal.aborted).toBe(true)
  await act(async () => requests[1].resolve([stocks[1].id]))
  await act(async () => requests[0].resolve([stocks[0].id, stocks[2].id]))
  expect(shownSymbols()).toEqual([stocks[1].symbol])
})

test('a failed latest search shows the alert and keeps previous results; the next success clears it', async () => {
  const { api } = fakeApi()
  const { search, requests } = controlledSearch()
  api.search = search
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  await typeInSearch('a')
  await act(async () => requests[0].resolve([stocks[0].id]))
  await typeInSearch('b')
  await act(async () => requests[1].reject(new Error('boom')))
  expect(screen.getByRole('alert').textContent).toBe('Search failed')
  expect(shownSymbols()).toEqual([stocks[0].symbol])
  await typeInSearch('c')
  await act(async () => requests[2].resolve([stocks[1].id]))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(shownSymbols()).toEqual([stocks[1].symbol])
})
