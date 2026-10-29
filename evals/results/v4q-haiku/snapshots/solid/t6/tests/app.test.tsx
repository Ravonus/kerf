import { fireEvent, render, screen, within, waitFor } from '@solidjs/testing-library'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { work, sparkline } from '../src/lib/format'

const stocks = seedStocks(3)
const holdings = [{ id: 's1', qty: 2 }]

type DetailCall = { id: string; resolve: (d: { description: string }) => void; reject: (e: Error) => void }
type Call = { query: string; signal: AbortSignal; resolve: (ids: string[]) => void; reject: (e: Error) => void }

function makeApi() {
  const subs: Array<(q: Quote) => void> = []
  const unsubscribed = { count: 0 }
  const calls: Call[] = []
  const detailCalls: DetailCall[] = []
  const api: Api = {
    details: (id: string) => new Promise((resolve, reject) => detailCalls.push({ id, resolve, reject })),
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
  return { api, push: (q: Quote) => subs.forEach(s => s(q)), subs, unsubscribed, calls, detailCalls }
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

// ---- Ticket 4: details and notes ----

const detailsRegion = () => screen.queryByRole('region', { name: 'Details' })
const openDetails = (symbol: string) => fireEvent.click(screen.getByRole('button', { name: `Details ${symbol}` }))

test('Details opens a panel with heading, live price and description', async () => {
  const { api, detailCalls, push } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  openDetails(stocks[1].symbol)
  expect(detailsRegion()).not.toBeNull()
  expect(screen.getByRole('heading', { name: new RegExp(stocks[1].symbol) })).toBeTruthy()
  expect(screen.getByText('Loading…')).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByLabelText('Notes'))
  detailCalls[0].resolve({ description: 'About BOL0' })
  await waitFor(() => expect(screen.getByText('About BOL0')).toBeTruthy())
  expect(screen.getByTestId('detail-price').textContent).toBe(`$${stocks[1].price.toFixed(2)}`)
  push({ id: stocks[1].id, price: 55 })
  expect(screen.getByTestId('detail-price').textContent).toBe('$55.00')
})

test('a failed load shows an alert and Retry loads again', async () => {
  const { api, detailCalls } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  openDetails(stocks[0].symbol)
  detailCalls[0].reject(new Error('down'))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("Couldn't load details"))
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(screen.getByText('Loading…')).toBeTruthy()
  detailCalls[1].resolve({ description: 'Second try' })
  await waitFor(() => expect(screen.getByText('Second try')).toBeTruthy())
  expect(screen.queryByRole('alert')).toBeNull()
})

test('a late description for a stock no longer open is never shown', async () => {
  const { api, detailCalls } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  openDetails(stocks[0].symbol)
  openDetails(stocks[1].symbol)
  detailCalls[1].resolve({ description: 'for B' })
  await waitFor(() => expect(screen.getByText('for B')).toBeTruthy())
  detailCalls[0].resolve({ description: 'for A' })
  await new Promise(r => setTimeout(r, 0))
  expect(screen.queryByText('for A')).toBeNull()
  expect(screen.getByText('for B')).toBeTruthy()
})

test('Escape closes the panel and returns focus to its Details button', async () => {
  const { api, detailCalls } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  openDetails(stocks[0].symbol)
  detailCalls[0].resolve({ description: 'x' })
  fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Escape' })
  expect(detailsRegion()).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: `Details ${stocks[0].symbol}` }))
})

test('Save and Undo work across stocks and the textarea shows the restored note', async () => {
  const { api, detailCalls } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const undo = () => screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement
  const notes = () => screen.getByLabelText('Notes') as HTMLTextAreaElement

  openDetails(stocks[0].symbol)
  detailCalls[0].resolve({ description: 'a' })
  expect(undo().disabled).toBe(true)
  fireEvent.input(notes(), { target: { value: 'A1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  fireEvent.input(notes(), { target: { value: 'A2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  openDetails(stocks[1].symbol)
  detailCalls[1].resolve({ description: 'b' })
  expect(notes().value).toBe('')
  fireEvent.input(notes(), { target: { value: 'B1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  fireEvent.click(undo()) // undoes B1 -> B's note is empty; B is open, so textarea shows ''
  expect(notes().value).toBe('')
  fireEvent.click(undo()) // undoes A2 -> A's note becomes A1; A not open
  expect(notes().value).toBe('')
  openDetails(stocks[0].symbol)
  detailCalls[2].resolve({ description: 'a again' })
  expect(notes().value).toBe('A1')
  fireEvent.click(undo()) // undoes A1 -> A's note empty, A open
  expect(notes().value).toBe('')
  expect(undo().disabled).toBe(true)
})

// ---- Ticket 5: bursts and sorting ----

const rowSymbols = () => symbols()

test('Sort by Change orders by biggest gain, ties in list order, and follows quotes', async () => {
  const { api, push } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const sort = screen.getByLabelText('Sort') as HTMLSelectElement
  expect(sort.value).toBe('symbol')
  expect(rowSymbols()).toEqual(stocks.map(s => s.symbol))
  fireEvent.change(sort, { target: { value: 'change' } })
  // stock 0 and stock 2 end flat (tie), stock 1 gains.
  push({ id: stocks[0].id, price: stocks[0].prevClose })
  push({ id: stocks[2].id, price: stocks[2].prevClose })
  push({ id: stocks[1].id, price: stocks[1].prevClose * 1.5 })
  expect(rowSymbols()).toEqual([stocks[1].symbol, stocks[0].symbol, stocks[2].symbol])
  push({ id: stocks[2].id, price: stocks[2].prevClose * 0.5 })
  expect(rowSymbols()).toEqual([stocks[1].symbol, stocks[0].symbol, stocks[2].symbol])
  push({ id: stocks[0].id, price: stocks[0].prevClose * 2 })
  expect(rowSymbols()).toEqual([stocks[0].symbol, stocks[1].symbol, stocks[2].symbol])
})

test('a synchronous burst appends every quote to its sparkline, including repeats', async () => {
  const { api, push } = makeApi()
  render(() => <App api={api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const row = within(list).getAllByRole('listitem')[0]
  const prices: number[] = [stocks[0].price]
  for (let i = 0; i < 40; i++) {
    const price = 50 + i
    push({ id: stocks[0].id, price })
    prices.push(price)
  }
  expect(within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')).toBe(sparkline(prices.slice(-20)))
})

test('sort mode survives a reload and combines with search', async () => {
  const first = makeApi()
  const { unmount } = render(() => <App api={first.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'change' } })
  unmount()

  const second = makeApi()
  render(() => <App api={second.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect((screen.getByLabelText('Sort') as HTMLSelectElement).value).toBe('change')
  type('ced')
  second.calls[0].resolve([stocks[2].id])
  await waitFor(() => expect(rowSymbols()).toEqual([stocks[2].symbol]))
})

// ---- Ticket 6: sector tabs ----

const tab = (name: string) => screen.getByRole('button', { name })

test('tabs filter by sector, and the count follows the current tab', async () => {
  const { api } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(tab('All').getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(tab('energy'))
  expect(tab('energy').getAttribute('aria-pressed')).toBe('true')
  expect(symbols()).toEqual([stocks[1].symbol])
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
  fireEvent.click(tab('finance'))
  expect(symbols()).toEqual([])
  expect(screen.getByTestId('count').textContent).toBe('0 stocks')
})

test('each tab keeps its own search; a tab search keeps running when you switch away', async () => {
  const { api, calls } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('bol') // All
  fireEvent.click(tab('tech'))
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('')
  expect(screen.queryByRole('status')).toBeNull()
  type('acm') // tech
  expect(calls.map(c => c.query)).toEqual(['bol', 'acm'])
  expect(calls[0].signal.aborted).toBe(false)
  expect(screen.getByRole('status').textContent).toBe('Searching…')

  fireEvent.click(tab('All'))
  expect(screen.getByRole('status').textContent).toBe('Searching…') // All's own request is still pending
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('bol')
  calls[0].resolve([stocks[1].id])
  calls[1].resolve([stocks[0].id])
  await waitFor(() => expect(symbols()).toEqual([stocks[1].symbol]))

  fireEvent.click(tab('tech'))
  expect(symbols()).toEqual([stocks[0].symbol])
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
})

test('a tab search that fails shows its alert only in that tab', async () => {
  const { api, calls } = makeApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  type('zzz') // All
  fireEvent.click(tab('health'))
  calls[0].reject(new Error('boom'))
  await new Promise(r => setTimeout(r, 0))
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(tab('All'))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Search failed'))
})

test('favorites are shared by all tabs', async () => {
  const { api } = makeFavApi()
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(star(stocks[1].symbol))
  fireEvent.click(tab('energy'))
  expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('true')
})

test('selected tab and each tab settings survive a reload; the restored search runs when the tab is shown', async () => {
  const first = makeApi()
  const { unmount } = render(() => <App api={first.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(tab('energy'))
  type('bol')
  fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'change' } })
  unmount()

  const second = makeApi()
  render(() => <App api={second.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(tab('energy').getAttribute('aria-pressed')).toBe('true')
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('bol')
  expect((screen.getByLabelText('Sort') as HTMLSelectElement).value).toBe('change')
  expect(second.calls.map(c => c.query)).toEqual(['bol'])
  second.calls[0].resolve([stocks[1].id])
  await waitFor(() => expect(symbols()).toEqual([stocks[1].symbol]))
  fireEvent.click(tab('All'))
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('')
})
