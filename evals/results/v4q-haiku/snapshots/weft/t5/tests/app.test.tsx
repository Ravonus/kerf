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
  // Descriptions stay pending until the test answers them.
  const detailRequests: DetailRequest[] = []
  const api: Api = {
    details(id) {
      return new Promise<{ description: string }>((resolve, reject) => {
        detailRequests.push({
          id,
          resolve: description => resolve({ description }),
          reject: () => reject(new Error('failed')),
        })
      })
    },
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
    detailRequests,
  }
}

type DetailRequest = { id: string; resolve: (description: string) => void; reject: () => void }

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

const panel = () => dom.getByRole('region', { name: 'Details' })
const notes = () => dom.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
const details = (symbol: string) => dom.getByRole('button', { name: `Details ${symbol}` })

/** Opens a stock's details and answers its description request with `text`. */
async function openWith(feed: ReturnType<typeof fakeApi>, symbol: string, text: string) {
  await user.click(details(symbol))
  feed.detailRequests.at(-1)!.resolve(text)
  await flush()
}

/** Replaces the Notes text. */
async function typeNote(text: string) {
  await user.clear(notes())
  if (text) await user.type(notes(), text)
}

test('a details panel opens with the symbol, name, live price and description', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await user.click(details('BOL0'))
  expect(panel().querySelector('h2')!.textContent).toBe('BOL0 Bolt Energy')
  expect(within(panel()).getByText('Loading…')).toBeTruthy()
  feed.detailRequests.at(-1)!.resolve('A bolt company.')
  await flush()
  expect(within(panel()).getByText('A bolt company.')).toBeTruthy()
  expect(dom.getByTestId('detail-price').textContent).toBe(money(feed.stocks[1].price))
  feed.push({ id: 's1', price: 61 })
  await flush()
  expect(dom.getByTestId('detail-price').textContent).toBe(money(61))
})

test('a failed description shows an alert, and Retry loads it again', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await user.click(details('BOL0'))
  feed.detailRequests.at(-1)!.reject()
  await flush()
  expect(dom.getByRole('alert').textContent).toBe("Couldn't load details")
  await user.click(dom.getByRole('button', { name: 'Retry' }))
  expect(feed.detailRequests).toHaveLength(2)
  feed.detailRequests.at(-1)!.resolve('Recovered.')
  await flush()
  expect(dom.queryByRole('alert')).toBeNull()
  expect(within(panel()).getByText('Recovered.')).toBeTruthy()
})

test('a description that arrives late for a stock no longer open is never shown', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await user.click(details('ACM0'))
  await user.click(details('CED0'))
  feed.detailRequests[1].resolve('Cedar text')
  await flush()
  feed.detailRequests[0].resolve('Acme text')
  await flush()
  expect(within(panel()).getByText('Cedar text')).toBeTruthy()
  expect(dom.queryByText('Acme text')).toBeNull()
  expect(panel().querySelector('h2')!.textContent).toBe('CED0 Cedar Health')
})

test('opening a panel focuses Notes; Escape closes it and returns focus to the Details button', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  await user.click(details('BOL0'))
  expect(document.activeElement).toBe(notes())
  await user.keyboard('{Escape}')
  expect(dom.queryByRole('region', { name: 'Details' })).toBeNull()
  expect(document.activeElement).toBe(details('BOL0'))
})

test('Notes show the open stock saved note, and Undo steps back through saves across stocks', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  const undo = () => dom.getByRole('button', { name: 'Undo' })
  await openWith(feed, 'ACM0', 'x')
  expect(undo().hasAttribute('disabled')).toBe(true)
  await typeNote('a1')
  await user.click(dom.getByRole('button', { name: 'Save' }))
  await typeNote('a2')
  await user.click(dom.getByRole('button', { name: 'Save' }))
  await openWith(feed, 'BOL0', 'x')
  expect(notes().value).toBe('')
  await typeNote('b1')
  await user.click(dom.getByRole('button', { name: 'Save' }))

  await user.click(undo())            // undoes the save on BOL0, which is open
  expect(notes().value).toBe('')
  await user.click(undo())            // undoes the second save on ACM0, which is not open
  await openWith(feed, 'ACM0', 'x')
  expect(notes().value).toBe('a1')
  await user.click(undo())            // undoes the first save on ACM0
  expect(notes().value).toBe('')
  expect(undo().hasAttribute('disabled')).toBe(true)
})

const sortBy = () => dom.getByRole('combobox', { name: 'Sort' })

test('sorting by Change puts the biggest gain first, ties in list order, and follows quotes as they arrive', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  await rowsOf(3)
  expect(shownSymbols()).toEqual(['ACM0', 'BOL0', 'CED0'])
  await user.selectOptions(sortBy(), 'change')
  // Every seeded stock starts at -3%, so all three tie and keep list order.
  expect(shownSymbols()).toEqual(['ACM0', 'BOL0', 'CED0'])
  feed.push({ id: 's2', price: 100 }) // CED0 gains about 19%
  await flush()
  expect(shownSymbols()).toEqual(['CED0', 'ACM0', 'BOL0'])
  feed.push({ id: 's0', price: 200 }) // ACM0 gains 1900%
  await flush()
  expect(shownSymbols()).toEqual(['ACM0', 'CED0', 'BOL0'])
})

test('a burst of quotes, including the same stock twice, appends every price to its sparkline', async () => {
  const feed = fakeApi(3)
  render(App, { api: feed.api })
  const [, row] = await rowsOf(3)
  const s = feed.stocks[1]
  feed.push({ id: 's1', price: 50 })
  feed.push({ id: 's0', price: 9 })
  feed.push({ id: 's1', price: 60 })
  feed.push({ id: 's2', price: 80 })
  await flush()
  expect(within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')).toBe(sparkline([s.price, 50, 60]))
  expect(within(row).getByTestId('price').textContent).toBe(money(60))
})

test('the sort survives a reload, and combines with search', async () => {
  const feed = fakeApi(3)
  const first = render(App, { api: feed.api })
  await rowsOf(3)
  await user.selectOptions(sortBy(), 'change')
  first.unmount()
  render(App, { api: feed.api })
  await rowsOf(3)
  expect((sortBy() as HTMLSelectElement).value).toBe('change')
  await search('a')
  feed.requests.at(-1)!.resolve(['s0', 's2'])
  await flush()
  feed.push({ id: 's2', price: 100 })
  await flush()
  expect(shownSymbols()).toEqual(['CED0', 'ACM0'])
})

test('a burst of quotes formats each touched row once, and sorting by Change formats nothing', async () => {
  const feed = fakeApi(200)
  render(App, { api: feed.api })
  await rowsOf(200)
  await user.selectOptions(sortBy(), 'change')
  const before = work.calls
  for (let i = 0; i < 30; i++) feed.push({ id: `s${i * 3 + 1}`, price: 20 + i }) // 30 distinct stocks, one of them held
  await flush()
  // 3 formatter calls per row (price, change, sparkline) plus the portfolio value.
  expect(work.calls - before).toBe(30 * 3 + 1)
})
