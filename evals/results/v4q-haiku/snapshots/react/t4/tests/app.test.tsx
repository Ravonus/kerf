import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { seedStocks, type Api, type QuoteUpdate } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

const stocks = seedStocks(3)

beforeEach(() => localStorage.clear())

function fakeApi(holdings = [{ id: 's1', qty: 2 }]) {
  const listeners = new Set<(q: QuoteUpdate) => void>()
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve(holdings),
    search: vi.fn((query: string) => Promise.resolve(
      stocks.filter(s => `${s.symbol} ${s.name}`.toLowerCase().includes(query.toLowerCase())).map(s => s.id))),
    setFavorite: vi.fn(() => Promise.resolve()),
    details: vi.fn(() => Promise.resolve({ description: 'A description' })),
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

type Save = { id: string; favorite: boolean; resolve: () => void; reject: (e: unknown) => void }

function controlledSave() {
  const saves: Save[] = []
  const setFavorite = vi.fn((id: string, favorite: boolean) =>
    new Promise<void>((resolve, reject) => { saves.push({ id, favorite, resolve, reject }) }))
  return { setFavorite, saves }
}

function favoriteButton(symbol: string) {
  return screen.getByRole('button', { name: `Favorite ${symbol}` })
}

test('clicking a star flips it at once and saves the new value', async () => {
  const { api } = fakeApi()
  const { setFavorite, saves } = controlledSave()
  api.setFavorite = setFavorite
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(favoriteButton(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(favoriteButton(stocks[1].symbol))
  expect(favoriteButton(stocks[1].symbol).getAttribute('aria-pressed')).toBe('true')
  expect(saves[0]).toMatchObject({ id: stocks[1].id, favorite: true })
  await act(async () => saves[0].resolve())
  expect(favoriteButton(stocks[1].symbol).getAttribute('aria-pressed')).toBe('true')
})

test('a failed save puts the star back and shows an alert; other stars are untouched', async () => {
  const { api } = fakeApi()
  const { setFavorite, saves } = controlledSave()
  api.setFavorite = setFavorite
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  // Stocks 1 and 2 start unfavorited; stock 0 is a seeded favorite.
  fireEvent.click(favoriteButton(stocks[1].symbol))
  fireEvent.click(favoriteButton(stocks[2].symbol))
  await act(async () => saves[0].reject(new Error('nope')))
  expect(favoriteButton(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('alert').textContent).toBe(`Couldn't update ${stocks[1].symbol}`)
  // The other save is still pending and its star keeps its optimistic value.
  expect(favoriteButton(stocks[2].symbol).getAttribute('aria-pressed')).toBe('true')
  await act(async () => saves[1].resolve())
  expect(favoriteButton(stocks[2].symbol).getAttribute('aria-pressed')).toBe('true')
})

test('a failed save does not revert a star the user clicked again since', async () => {
  const { api } = fakeApi()
  const { setFavorite, saves } = controlledSave()
  api.setFavorite = setFavorite
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(favoriteButton(stocks[1].symbol)) // false -> true
  fireEvent.click(favoriteButton(stocks[1].symbol)) // true -> false
  await act(async () => saves[0].reject(new Error('nope')))
  expect(favoriteButton(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
  await act(async () => saves[1].resolve())
  expect(favoriteButton(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
})

test('Favorites only combines with search', async () => {
  const { api } = fakeApi()
  render(<App api={api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  // Stock 0 is the only favorite in the seed data (i % 9 === 0).
  fireEvent.click(screen.getByLabelText('Favorites only'))
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual([stocks[0].symbol])
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: stocks[1].symbol } })
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  expect(within(list).queryAllByTestId('symbol')).toHaveLength(0)
})

test('search text and Favorites only survive a reload; the restored search runs again', async () => {
  const first = fakeApi()
  const { unmount } = render(<App api={first.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: stocks[2].name } })
  fireEvent.click(screen.getByLabelText('Favorites only'))
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  unmount()

  const second = fakeApi()
  render(<App api={second.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(screen.getByLabelText('Search')).toHaveProperty('value', stocks[2].name)
  expect(screen.getByLabelText('Favorites only')).toHaveProperty('checked', true)
  expect(second.api.search).toHaveBeenCalledWith(stocks[2].name, expect.any(AbortSignal))
})

function detailsButton(symbol: string) {
  return screen.getByRole('button', { name: `Details ${symbol}` })
}

test('opening details shows the heading, live price and description, and focuses Notes', async () => {
  const { api, push } = fakeApi()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(detailsButton(stocks[1].symbol))
  const region = screen.getByRole('region', { name: 'Details' })
  expect(within(region).getByRole('heading').textContent).toBe(`${stocks[1].symbol} ${stocks[1].name}`)
  expect(await within(region).findByText('A description')).toBeTruthy()
  expect(document.activeElement).toBe(within(region).getByLabelText('Notes'))
  push({ id: stocks[1].id, price: 77.25 })
  expect(within(region).getByTestId('detail-price').textContent).toBe('$77.25')
})

test('Escape closes the panel and returns focus to the Details button', async () => {
  const { api } = fakeApi()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(detailsButton(stocks[0].symbol))
  fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Escape' })
  expect(screen.queryByRole('region', { name: 'Details' })).toBeNull()
  expect(document.activeElement).toBe(detailsButton(stocks[0].symbol))
})

test('a description that arrives after another stock was opened is never shown', async () => {
  const { api } = fakeApi()
  const pending: { id: string; resolve: (v: { description: string }) => void }[] = []
  api.details = vi.fn((id: string) => new Promise<{ description: string }>(resolve => { pending.push({ id, resolve }) }))
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(detailsButton(stocks[0].symbol))
  fireEvent.click(detailsButton(stocks[1].symbol))
  await act(async () => pending[1].resolve({ description: 'second' }))
  await act(async () => pending[0].resolve({ description: 'first (late)' }))
  const region = screen.getByRole('region', { name: 'Details' })
  expect(within(region).getByText('second')).toBeTruthy()
  expect(within(region).queryByText('first (late)')).toBeNull()
})

test('a failed load shows an alert, and Retry loads again', async () => {
  const { api } = fakeApi()
  api.details = vi.fn()
    .mockRejectedValueOnce(new Error('down'))
    .mockResolvedValueOnce({ description: 'Recovered' }) as Api['details']
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(detailsButton(stocks[0].symbol))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', "Couldn't load details")
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('Recovered')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('notes save per stock, and Undo walks back through saves across stocks', async () => {
  const { api } = fakeApi()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const undo = () => screen.getByRole('button', { name: 'Undo' })
  fireEvent.click(detailsButton(stocks[0].symbol))
  expect(undo().hasAttribute('disabled')).toBe(true)

  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'a' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  fireEvent.click(detailsButton(stocks[1].symbol))
  expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('')
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'b' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  // Undo the save for stock 1 (currently open): its textarea shows the restored empty note.
  fireEvent.click(undo())
  expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('')
  // Undo the save for stock 0 while stock 1 is open: stock 1's textarea is untouched.
  fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'typed' } })
  fireEvent.click(undo())
  expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('typed')
  expect(undo().hasAttribute('disabled')).toBe(true)

  fireEvent.click(detailsButton(stocks[0].symbol))
  expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('')
})
