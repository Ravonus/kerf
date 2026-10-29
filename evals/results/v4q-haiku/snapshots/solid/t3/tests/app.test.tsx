import { fireEvent, render, screen, within, waitFor } from '@solidjs/testing-library'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { work, sparkline } from '../src/lib/format'

const stocks = seedStocks(3)
const holdings = [{ id: 's1', qty: 2 }]

type Call = { query: string; signal: AbortSignal; resolve: (ids: string[]) => void; reject: (e: Error) => void }

function makeApi() {
  const subs: Array<(q: Quote) => void> = []
  const unsubscribed = { count: 0 }
  const calls: Call[] = []
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve(structuredClone(holdings)),
    subscribeQuotes(onQuote) {
      subs.push(onQuote)
      return () => {
        unsubscribed.count++
      }
    },
    setFavorite: () => Promise.resolve(),
    search(query, signal) {
      return new Promise((resolve, reject) => {
        calls.push({ query, signal, resolve, reject })
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    },
  }
  return { api, push: (q: Quote) => subs.forEach(s => s(q)), subs, unsubscribed, calls }
}

const symbols = () => within(screen.getByRole('list', { name: 'Stocks' })).queryAllByTestId('symbol').map(n => n.textContent)
const type = (value: string) => fireEvent.input(screen.getByLabelText('Search'), { target: { value } })

test('lists stocks after loading', async () => {
  render(() => <App api={makeApi().api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(stocks.map(s => s.symbol))
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  render(() => <App api={makeApi().api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(screen.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * stocks[1].price).toFixed(2)}`)
})

test('quotes update price, change, sparkline and portfolio', async () => {
  const { api, push } = makeApi()
  render(() => <App api={api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const row = within(list).getAllByRole('listitem')[1]
  const s = stocks[1]
  push({ id: s.id, price: 100 })
  expect(within(row).getByTestId('price').textContent).toBe('$100.00')
  expect(within(row).getByTestId('change').textContent).toBe(`+${(((100 - s.prevClose) / s.prevClose) * 100).toFixed(2)}%`.replace('+-', '-'))
  expect(within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')).toBe(sparkline([s.price, 100]))
  expect(screen.getByTestId('portfolio').textContent).toBe('Portfolio: $200.00')
})

test('sparkline keeps the last 20 prices', async () => {
  const { api, push } = makeApi()
  render(() => <App api={api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const row = within(list).getAllByRole('listitem')[0]
  const prices: number[] = [stocks[0].price]
  for (let i = 1; i <= 25; i++) {
    push({ id: stocks[0].id, price: 10 + i })
    prices.push(10 + i)
  }
  expect(within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')).toBe(sparkline(prices.slice(-20)))
})

test('a quote re-formats only its own row', async () => {
  const { api, push } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  push({ id: stocks[2].id, price: 42 })
  expect(work.calls - before).toBe(3) // money, pct, sparkline for that row only
})

test('subscribes once and unsubscribes on unmount', async () => {
  const { api, subs, unsubscribed } = makeApi()
  const { unmount } = render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(subs.length).toBe(1)
  unmount()
  expect(unsubscribed.count).toBe(1)
})

test('search filters the list and the count, using the trimmed text', async () => {
  const { api, calls } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('  bol ')
  expect(calls.map(c => c.query)).toEqual(['bol'])
  calls[0].resolve([stocks[1].id])
  await waitFor(() => expect(symbols()).toEqual([stocks[1].symbol]))
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
})

test('empty text shows every stock and sends no request', async () => {
  const { api, calls } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('   ')
  expect(calls.length).toBe(0)
  expect(symbols()).toEqual(stocks.map(s => s.symbol))
})

test('shows Searching while pending and aborts superseded requests', async () => {
  const { api, calls } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('a')
  expect(screen.getByRole('status').textContent).toBe('Searching…')
  type('ac')
  expect(calls[0].signal.aborted).toBe(true)
  // The stale response arrives late and must be ignored.
  calls[0].resolve(stocks.map(s => s.id))
  calls[1].resolve([stocks[0].id])
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  expect(symbols()).toEqual([stocks[0].symbol])
})

test('a failed latest search shows an alert, keeps results, and the next success clears it', async () => {
  const { api, calls } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('bol')
  calls[0].resolve([stocks[1].id])
  await waitFor(() => expect(symbols()).toEqual([stocks[1].symbol]))
  type('zzz')
  calls[1].reject(new Error('boom'))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Search failed'))
  expect(symbols()).toEqual([stocks[1].symbol])
  type('ced')
  calls[2].resolve([stocks[2].id])
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(symbols()).toEqual([stocks[2].symbol])
})

test('quotes keep updating rows that are shown by search', async () => {
  const { api, push, calls } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('bol')
  calls[0].resolve([stocks[1].id])
  await waitFor(() => expect(symbols()).toEqual([stocks[1].symbol]))
  push({ id: stocks[1].id, price: 77 })
  expect(within(screen.getByRole('list', { name: 'Stocks' })).getByTestId('price').textContent).toBe('$77.00')
})

// ---- Ticket 3: favorites ----

type FavCall = { id: string; favorite: boolean; resolve: () => void; reject: (e: Error) => void }

function makeFavApi() {
  const favCalls: FavCall[] = []
  const base = makeApi()
  const api: Api = {
    ...base.api,
    setFavorite(id, favorite) {
      return new Promise((resolve, reject) => favCalls.push({ id, favorite, resolve, reject }))
    },
  }
  return { ...base, api, favCalls }
}

const star = (symbol: string) => screen.getByRole('button', { name: `Favorite ${symbol}` })

beforeEach(() => localStorage.clear())

test('stars reflect the stock flags and clicking flips at once, then saves', async () => {
  const { api, favCalls } = makeFavApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(star(stocks[0].symbol).getAttribute('aria-pressed')).toBe('true')
  expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(star(stocks[1].symbol))
  expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('true')
  expect(favCalls).toEqual([expect.objectContaining({ id: stocks[1].id, favorite: true })])
  favCalls[0].resolve()
  await waitFor(() => expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('true'))
  expect(screen.queryByRole('alert')).toBeNull()
})

test('a refused save puts the star back and shows an alert', async () => {
  const { api, favCalls } = makeFavApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(star(stocks[1].symbol))
  favCalls[0].reject(new Error('nope'))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(`Couldn't update ${stocks[1].symbol}`))
  expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
})

test('a refused save does not revert if the star was clicked again since', async () => {
  const { api, favCalls } = makeFavApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(star(stocks[1].symbol)) // false -> true
  fireEvent.click(star(stocks[1].symbol)) // true -> false
  favCalls[0].reject(new Error('nope'))
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
  favCalls[1].resolve()
})

test('other stars, including ones with pending saves, are not changed by a refusal', async () => {
  const { api, favCalls } = makeFavApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(star(stocks[2].symbol)) // pending
  fireEvent.click(star(stocks[1].symbol))
  favCalls[1].reject(new Error('nope'))
  await waitFor(() => expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false'))
  expect(star(stocks[2].symbol).getAttribute('aria-pressed')).toBe('true')
  favCalls[0].resolve()
})

test('Favorites only combines with search', async () => {
  const { api, calls } = makeFavApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(star(stocks[1].symbol)) // favourite BOL0 too
  fireEvent.click(screen.getByLabelText('Favorites only'))
  expect(symbols()).toEqual([stocks[0].symbol, stocks[1].symbol])
  type('ced')
  calls[0].resolve([stocks[2].id])
  await waitFor(() => expect(symbols()).toEqual([]))
  expect(screen.getByTestId('count').textContent).toBe('0 stocks')
})

test('search text and Favorites only survive a reload and the search runs again', async () => {
  const first = makeFavApi()
  const { unmount } = render(() => <App api={first.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(screen.getByLabelText('Favorites only'))
  type('bol')
  unmount()

  const second = makeFavApi()
  render(() => <App api={second.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect((screen.getByLabelText('Favorites only') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('bol')
  expect(second.calls.map(c => c.query)).toEqual(['bol'])
})
