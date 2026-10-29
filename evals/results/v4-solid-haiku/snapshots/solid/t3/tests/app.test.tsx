import { fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library'
import { beforeEach } from 'vitest'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

const stocks = seedStocks(3).map(s => ({ ...s, favorite: false })) // no favorites to start

type SearchCall = { query: string; signal: AbortSignal; resolve(ids: string[]): void; reject(): void }
type SaveCall = { id: string; favorite: boolean; resolve(): void; reject(): void }

beforeEach(() => localStorage.clear())

/** An api whose quotes and search responses the test controls. */
function liveApi() {
  const sub = { onQuote: undefined as ((q: Quote) => void) | undefined, unsubscribed: 0 }
  const searches: SearchCall[] = []
  const saves: SaveCall[] = []
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]),
    setFavorite(id, favorite) {
      return new Promise((resolve, reject) => {
        saves.push({ id, favorite, resolve, reject: () => reject(new Error('refused')) })
      })
    },
    subscribeQuotes(onQuote) {
      sub.onQuote = onQuote
      return () => {
        sub.unsubscribed++
        sub.onQuote = undefined
      }
    },
    search(query, signal) {
      return new Promise((resolve, reject) => {
        searches.push({ query, signal, resolve, reject: () => reject(new Error('boom')) })
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    },
  }
  return { api, push: (q: Quote) => sub.onQuote!(q), sub, searches, saves }
}

/** Answers a search from the test stocks: the ids whose symbol or name contains `query`. */
const idsFor = (query: string) =>
  stocks.filter(s => `${s.symbol} ${s.name}`.toLowerCase().includes(query.toLowerCase())).map(s => s.id)

const list = () => screen.getByRole('list', { name: 'Stocks' })
const row = (i: number) => within(list().children[i] as HTMLElement)
const type = (text: string) => fireEvent.input(screen.getByLabelText('Search'), { target: { value: text } })

test('lists stocks after loading', async () => {
  render(() => <App api={liveApi().api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list()).getAllByTestId('symbol').map(n => n.textContent)).toEqual(stocks.map(s => s.symbol))
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  render(() => <App api={liveApi().api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(screen.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * stocks[1].price).toFixed(2)}`)
})

test('a quote updates the row price, change, sparkline and the portfolio', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  live.push({ id: 's1', price: 100 })
  expect(row(1).getByTestId('price').textContent).toBe('$100.00')
  expect(row(1).getByTestId('change').textContent).toBe(`+${(((100 - stocks[1].prevClose) / stocks[1].prevClose) * 100).toFixed(2)}%`)
  expect(screen.getByTestId('portfolio').textContent).toBe('Portfolio: $200.00')
  const d = row(1).getByTestId('spark').querySelector('path')!.getAttribute('d')!
  expect(d.split(' ')).toHaveLength(2) // loaded price, then the quote
})

test('sparkline keeps the last 20 prices', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  for (let i = 0; i < 25; i++) live.push({ id: 's0', price: 10 + i })
  const d = row(0).getByTestId('spark').querySelector('path')!.getAttribute('d')!
  expect(d.split(' ')).toHaveLength(20)
})

test('a quote only formats the changed row, the others stay untouched', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  work.calls = 0
  live.push({ id: 's0', price: 42 }) // not held: no portfolio change
  expect(work.calls).toBe(3) // price, change, sparkline
})

test('the subscription is opened once and closed on unmount', async () => {
  const live = liveApi()
  const { unmount } = render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(live.sub.onQuote).toBeDefined()
  unmount()
  expect(live.sub.unsubscribed).toBe(1)
})

test('search sends the trimmed text and shows only the returned stocks', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('  ' + stocks[2].symbol + ' ')
  expect(live.searches.map(s => s.query)).toEqual([stocks[2].symbol])
  live.searches[0].resolve(idsFor(stocks[2].symbol))
  await waitFor(() => expect(within(list()).getAllByTestId('symbol')).toHaveLength(1))
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
})

test('empty text shows every stock and sends no request', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('   ')
  expect(live.searches).toHaveLength(0)
  expect(within(list()).getAllByTestId('symbol')).toHaveLength(3)
})

test('only the latest query is shown, older requests are aborted', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('a')
  type('ab')
  expect(live.searches[0].signal.aborted).toBe(true)
  live.searches[1].resolve([stocks[0].id])
  await waitFor(() => expect(within(list()).getAllByTestId('symbol')).toHaveLength(1))
  // a late answer to the aborted query must not replace the shown results
  live.searches[0].resolve(stocks.map(s => s.id))
  await new Promise(r => setTimeout(r, 0))
  expect(within(list()).getAllByTestId('symbol')).toHaveLength(1)
})

test('shows Searching while the latest request is pending', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('x')
  expect(screen.getByRole('status').textContent).toBe('Searching…')
  live.searches[0].resolve([])
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
})

test('a failed search shows an alert, keeps the previous results, and the next success clears it', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type(stocks[0].symbol)
  live.searches[0].resolve([stocks[0].id])
  await waitFor(() => expect(within(list()).getAllByTestId('symbol')).toHaveLength(1))
  type('zzz')
  live.searches[1].reject()
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Search failed'))
  expect(within(list()).getAllByTestId('symbol')).toHaveLength(1)
  type(stocks[1].symbol)
  live.searches[2].resolve([stocks[1].id])
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(within(list()).getByTestId('symbol').textContent).toBe(stocks[1].symbol)
})

test('a search that only removes rows does not format the rows that stay', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const kept = list().children[1]
  type('q')
  live.searches[0].resolve([stocks[1].id, stocks[2].id])
  await waitFor(() => expect(within(list()).getAllByTestId('symbol')).toHaveLength(2))
  expect(list().children[0]).toBe(kept)
  work.calls = 0
  type('qq')
  live.searches[1].resolve([stocks[1].id])
  await waitFor(() => expect(within(list()).getAllByTestId('symbol')).toHaveLength(1))
  expect(list().children[0]).toBe(kept)
  expect(work.calls).toBe(0)
})

const star = (sym: string) => screen.getByRole('button', { name: `Favorite ${sym}` })
const favOnly = () => screen.getByLabelText('Favorites only') as HTMLInputElement

test('a star changes at once, saves, and shows its state', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(star(stocks[0].symbol).getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(star(stocks[0].symbol))
  expect(star(stocks[0].symbol).getAttribute('aria-pressed')).toBe('true')
  expect(live.saves[0]).toMatchObject({ id: 's0', favorite: true })
  live.saves[0].resolve()
  expect(star(stocks[0].symbol).getAttribute('aria-pressed')).toBe('true')
})

test('a failed save puts the star back and shows an alert', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(star(stocks[0].symbol))
  live.saves[0].reject()
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(`Couldn't update ${stocks[0].symbol}`))
  expect(star(stocks[0].symbol).getAttribute('aria-pressed')).toBe('false')
})

test('a failed save does not revert a star that was clicked again since', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(star(stocks[0].symbol)) // true
  fireEvent.click(star(stocks[0].symbol)) // false again
  live.saves[0].reject()
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(star(stocks[0].symbol).getAttribute('aria-pressed')).toBe('false')
  live.saves[1].resolve()
  expect(star(stocks[0].symbol).getAttribute('aria-pressed')).toBe('false')
})

test('other stars, including those with pending saves, do not change', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(star(stocks[0].symbol))
  fireEvent.click(star(stocks[1].symbol))
  live.saves[1].reject()
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(star(stocks[0].symbol).getAttribute('aria-pressed')).toBe('true')
  expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
})

test('favorites only shows favorites and combines with the search', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(star(stocks[2].symbol))
  live.saves[0].resolve()
  fireEvent.click(favOnly())
  expect(within(list()).getAllByTestId('symbol').map(n => n.textContent)).toEqual([stocks[2].symbol])
  fireEvent.input(screen.getByLabelText('Search'), { target: { value: stocks[0].symbol } })
  live.searches[0].resolve([stocks[0].id])
  await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0 stocks'))
})

test('the search text and favorites-only setting survive a reload and the search runs again', async () => {
  const first = liveApi()
  const { unmount } = render(() => <App api={first.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type(stocks[1].symbol)
  fireEvent.click(favOnly())
  unmount()

  const second = liveApi()
  render(() => <App api={second.api} />)
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe(stocks[1].symbol)
  expect(favOnly().checked).toBe(true)
  expect(second.searches.map(s => s.query)).toEqual([stocks[1].symbol])
})

test('toggling a star calls no formatters and touches only that row', async () => {
  const live = liveApi()
  render(() => <App api={live.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const other = list().children[2]
  const otherHTML = other.innerHTML
  work.calls = 0
  fireEvent.click(star(stocks[0].symbol))
  expect(work.calls).toBe(0)
  expect(other.innerHTML).toBe(otherHTML)
  expect(list().children[2]).toBe(other)
})
