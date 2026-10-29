// weft-allow T005: the watchlist's acceptance contract names data-testid values (symbol, count, portfolio)
import { screen as dom, within } from '@testing-library/dom'
import { flush, render, screen, user } from 'weft/test'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { money, pct, sparkline, work } from '../src/lib/format'

// The watchlist remembers its search and filter in localStorage: start every test from an empty store.
beforeEach(() => localStorage.clear())

/** A fake API whose quote feed the test drives by hand. */
function fakeApi(n: number, holdings = [{ id: 's1', qty: 2 }]) {
  const stocks = seedStocks(n)
  const listeners = new Set<(q: Quote) => void>()
  // Searches stay pending until the test answers them, so the test controls their order.
  const requests: SearchRequest[] = []
  // Saves stay pending until the test answers them.
  const saves: FavoriteSave[] = []
  const api: Api = {
    setFavorite(id, favorite) {
      return new Promise<void>((resolve, reject) => {
        saves.push({ id, favorite, resolve, reject: () => reject(new Error('refused')) })
      })
    },
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve(structuredClone(holdings)),
    search(query, signal) {
      return new Promise<string[]>((resolve, reject) => {
        const req: SearchRequest = { query, signal, resolve, reject: () => reject(new Error('search failed')) }
        requests.push(req)
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    },
    subscribeQuotes(onQuote) {
      listeners.add(onQuote)
      return () => listeners.delete(onQuote)
    },
  }
  return {
    api,
    stocks,
    push: (q: Quote) => { for (const l of listeners) l(q) },
    subscribers: () => listeners.size,
    requests,
    saves,
  }
}

type FavoriteSave = { id: string; favorite: boolean; resolve: () => void; reject: () => void }

type SearchRequest = { query: string; signal: AbortSignal; resolve: (ids: string[]) => void; reject: () => void }

/** The symbols of the rows on screen, in order. */
function shownSymbols() {
  return within(screen.getByRole('list', { name: 'Stocks' })).queryAllByTestId('symbol').map(n => n.textContent)
}

/** Types into the Search box, after clearing it. */
async function search(text: string) {
  await user.clear(dom.getByRole('textbox', { name: 'Search' }))
  if (text) await user.type(dom.getByRole('textbox', { name: 'Search' }), text)
}

const star = (symbol: string) => dom.getByRole('button', { name: `Favorite ${symbol}` })

async function rowsOf(n: number) {
  const list = await screen.findByRole('list', { name: 'Stocks' })
  return within(list).getAllByRole('listitem')
}

test('lists stocks after loading', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(feed.stocks.map(s => s.symbol))
  expect(dom.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await screen.findByRole('list', { name: 'Stocks' })
  expect(dom.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * feed.stocks[1].price).toFixed(2)}`)
})

test('a quote updates the price, the change and the sparkline of its row', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  const [, row] = await rowsOf(3)
  const s = feed.stocks[1]
  feed.push({ id: s.id, price: 50 })
  await flush()
  expect(within(row).getByTestId('price').textContent).toBe(money(50))
  expect(within(row).getByTestId('change').textContent).toBe(pct(((50 - s.prevClose) / s.prevClose) * 100))
  expect(within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')).toBe(sparkline([s.price, 50]))
})

test('the sparkline keeps the last 20 prices, oldest first', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  const [, row] = await rowsOf(3)
  const s = feed.stocks[1]
  const prices = Array.from({ length: 25 }, (_, i) => 10 + i)
  for (const price of prices) feed.push({ id: s.id, price })
  await flush()
  expect(within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')).toBe(sparkline(prices.slice(-20)))
})

test('the portfolio value follows current prices', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  feed.push({ id: 's1', price: 50 })
  await flush()
  expect(dom.getByTestId('portfolio').textContent).toBe(`Portfolio: ${money(100)}`)
})

test('a quote re-formats only its own row', async () => {
  const feed = fakeApi(200)
  render(App, { api: feed.api })
  await rowsOf(200)
  const before = work.calls
  feed.push({ id: 's100', price: 42 })
  await flush()
  expect(work.calls - before).toBe(3)
})

test('the subscription is closed when the app unmounts', async () => {
  const feed = fakeApi(3)
  const { unmount } = render(App, { api: feed.api })
  await rowsOf(3)
  expect(feed.subscribers()).toBe(1)
  unmount()
  expect(feed.subscribers()).toBe(0)
})

test('an empty search shows every stock and sends no request', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await search('   ')
  expect(feed.requests).toHaveLength(0)
  expect(shownSymbols()).toEqual(feed.stocks.map(s => s.symbol))
})

test('a search sends the trimmed text and shows only the stocks returned', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await search('  ac ')
  const last = feed.requests.at(-1)!
  expect(last.query).toBe('ac')
  last.resolve(['s0'])
  await flush()
  expect(shownSymbols()).toEqual([feed.stocks[0].symbol])
  expect(dom.getByTestId('count').textContent).toBe('1 stock')
})

test('an answer to an older query never replaces the latest one, and the older request is aborted', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await search('a')
  await search('ab')
  const [older, newer] = feed.requests.slice(-2)
  expect(older.signal.aborted).toBe(true)
  newer.resolve(['s1'])
  await flush()
  older.resolve(['s0', 's1', 's2'])
  await flush()
  expect(shownSymbols()).toEqual([feed.stocks[1].symbol])
})

test('shows Searching while the latest request is pending', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await search('a')
  expect(dom.getByRole('status').textContent).toBe('Searching…')
  feed.requests.at(-1)!.resolve(['s0'])
  await flush()
  expect(dom.queryByRole('status')).toBeNull()
})

test('a failed search shows an alert and keeps the previous results; the next success removes it', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await search('a')
  feed.requests.at(-1)!.resolve(['s0', 's1'])
  await flush()
  await user.type(dom.getByRole('textbox', { name: 'Search' }), 'x') // appends: 'ax', the box never empties
  feed.requests.at(-1)!.reject()
  await flush()
  expect(dom.getByRole('alert').textContent).toBe('Search failed')
  expect(shownSymbols()).toEqual([feed.stocks[0].symbol, feed.stocks[1].symbol])
  await user.type(dom.getByRole('textbox', { name: 'Search' }), 'y')
  feed.requests.at(-1)!.resolve(['s2'])
  await flush()
  expect(dom.queryByRole('alert')).toBeNull()
  expect(shownSymbols()).toEqual([feed.stocks[2].symbol])
})

test('quotes keep updating the rows that are shown', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await search('a')
  feed.requests.at(-1)!.resolve(['s2'])
  await flush()
  feed.push({ id: 's2', price: 77 })
  await flush()
  expect(within(screen.getByRole('list', { name: 'Stocks' })).getByTestId('price').textContent).toBe(money(77))
})

test('each row has a favorite button showing whether the stock is a favorite', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  expect(star('ACM0').getAttribute('aria-pressed')).toBe('true')
  expect(star('BOL0').getAttribute('aria-pressed')).toBe('false')
})

test('a click shows the new star at once and saves it', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await user.click(star('BOL0'))
  expect(star('BOL0').getAttribute('aria-pressed')).toBe('true')
  expect(feed.saves.at(-1)).toMatchObject({ id: 's1', favorite: true })
})

test('a refused save puts the star back and shows an alert', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await user.click(star('BOL0'))
  feed.saves.at(-1)!.reject()
  await flush()
  expect(star('BOL0').getAttribute('aria-pressed')).toBe('false')
  expect(dom.getByRole('alert').textContent).toBe("Couldn't update BOL0")
})

test('a refused save does not undo a later click on the same star, and other stars keep their state', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await user.click(star('BOL0'))
  await user.click(star('BOL0'))
  await user.click(star('CED0'))
  feed.saves[0].reject()
  await flush()
  expect(star('BOL0').getAttribute('aria-pressed')).toBe('false')
  expect(star('ACM0').getAttribute('aria-pressed')).toBe('true')
  expect(star('CED0').getAttribute('aria-pressed')).toBe('true')
  expect(dom.getByRole('alert').textContent).toBe("Couldn't update BOL0")
})

test('Favorites only shows only favorites, combined with the search', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await user.click(dom.getByRole('checkbox', { name: 'Favorites only' }))
  expect(shownSymbols()).toEqual(['ACM0'])
  expect(dom.getByTestId('count').textContent).toBe('1 stock')
  await user.click(dom.getByRole('checkbox', { name: 'Favorites only' }))
  expect(shownSymbols()).toEqual(['ACM0', 'BOL0', 'CED0'])
  await user.click(dom.getByRole('checkbox', { name: 'Favorites only' }))
  await search('bol')
  feed.requests.at(-1)!.resolve(['s1'])
  await flush()
  expect(shownSymbols()).toEqual([])
})

test('the search text and Favorites only survive a reload, and the restored search runs again', async () => {
  const feed = fakeApi(3)
  const first = render(App, { api: feed.api })
  await rowsOf(3)
  await search('ac')
  await user.click(dom.getByRole('checkbox', { name: 'Favorites only' }))
  first.unmount()

  const before = feed.requests.length
  render(App, { api: feed.api })
  await rowsOf(3)
  expect((dom.getByRole('textbox', { name: 'Search' }) as HTMLInputElement).value).toBe('ac')
  expect((dom.getByRole('checkbox', { name: 'Favorites only' }) as HTMLInputElement).checked).toBe(true)
  expect(feed.requests.length).toBe(before + 1)
  expect(feed.requests.at(-1)!.query).toBe('ac')
})
