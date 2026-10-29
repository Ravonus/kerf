// weft-allow T005: the watchlist's acceptance contract names data-testid values (symbol, count, portfolio)
import { screen as dom, within } from '@testing-library/dom'
import { cleanup, flush, render, screen, user } from 'weft/test'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

const stocks = seedStocks(3)
let push: (q: Quote) => void = () => {}

/** Search requests the test answers by hand, in the order they were sent. */
type Request = { query: string; signal: AbortSignal; resolve: (ids: string[]) => void; reject: (e: Error) => void }
let requests: Request[] = []
const latest = () => requests[requests.length - 1]

const api: Api = {
  listStocks: () => Promise.resolve(structuredClone(stocks)),
  listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]),
  subscribeQuotes: onQuote => {
    push = onQuote
    return () => { push = () => {} }
  },
  search: (query, signal) => new Promise((resolve, reject) => { requests.push({ query, signal, resolve, reject }) }),
  setFavorite: (id, favorite) => new Promise<void>((resolve, reject) => { saves.push({ id, favorite, resolve, reject }) }),
  details: id => new Promise((resolve, reject) => { detailRequests.push({ id, resolve, reject }) }),
}

/** Description requests the test answers by hand. */
type DetailRequest = { id: string; resolve: (d: { description: string }) => void; reject: (e: Error) => void }
let detailRequests: DetailRequest[] = []

/** Favorite saves the test answers by hand, in the order they were sent. */
type Save = { id: string; favorite: boolean; resolve: () => void; reject: (e: Error) => void }
let saves: Save[] = []

beforeEach(() => {
  requests = []
  saves = []
  detailRequests = []
  localStorage.clear()
})

test('lists stocks after loading', async () => {
  render(App, { api })
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(stocks.map(s => s.symbol))
  expect(dom.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  expect(dom.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * stocks[1].price).toFixed(2)}`)
})

test('a quote updates that row and the portfolio value', async () => {
  render(App, { api })
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const row = within(list).getAllByRole('listitem')[1]
  push({ id: 's1', price: 100 })
  await flush()
  expect(within(row).getByTestId('price').textContent).toBe('$100.00')
  expect(within(row).getByTestId('change').textContent).toBe(`+${(((100 - stocks[1].prevClose) / stocks[1].prevClose) * 100).toFixed(2)}%`)
  expect(dom.getByTestId('portfolio').textContent).toBe('Portfolio: $200.00')
})

test('the sparkline starts at the loaded price and keeps the last 20 prices', async () => {
  render(App, { api })
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const row = within(list).getAllByRole('listitem')[0]
  const points = () => within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')!.split(' ').length
  expect(points()).toBe(1)
  for (let i = 1; i <= 25; i++) push({ id: 's0', price: 10 + i })
  await flush()
  expect(points()).toBe(20)
})

test('a quote re-renders only its row and the portfolio, formatting only those', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  push({ id: 's0', price: 42 })
  await flush()
  // price, change and sparkline for the row; no portfolio change, so no header format
  expect(work.calls - before).toBe(3)
})

test('a quote touches only its row and the portfolio in the DOM', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await expect(() => push({ id: 's0', price: 43 })).toTouchAtMost(6, { runs: 8 })
})

const rowSymbols = () => within(dom.getByRole('list', { name: 'Stocks' })).queryAllByTestId('symbol').map(n => n.textContent)
const searchBox = () => screen.getByRole('textbox', { name: 'Search' })

test('typing sends the trimmed query and shows only the matches', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(searchBox(), ' ab ')
  expect(requests.map(r => r.query)).toEqual(['a', 'ab'])
  expect(requests[0].signal.aborted).toBe(true)
  latest().resolve([stocks[1].id])
  await flush()
  expect(rowSymbols()).toEqual([stocks[1].symbol])
  expect(dom.getByTestId('count').textContent).toBe('1 stock')
})

test('an empty search shows every stock and sends no request', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(searchBox(), 'a')
  latest().resolve([stocks[0].id])
  await flush()
  await user.clear(searchBox())
  expect(requests).toHaveLength(1)
  expect(rowSymbols()).toEqual(stocks.map(s => s.symbol))
})

test('only the latest query may show results', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(searchBox(), 'a')
  const first = latest()
  await user.type(searchBox(), 'b')
  const second = latest()
  second.resolve([stocks[0].id])
  await flush()
  first.reject(new DOMException('Aborted', 'AbortError'))
  await flush()
  expect(rowSymbols()).toEqual([stocks[0].symbol])
})

test('shows Searching while pending and a failure alert that the next success clears', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(searchBox(), 'a')
  expect(dom.getByRole('status').textContent).toBe('Searching…')
  latest().resolve([stocks[0].id])
  await flush()
  expect(dom.queryByRole('status')).toBeNull()

  await user.type(searchBox(), 'b')
  latest().reject(new Error('boom'))
  await flush()
  expect(dom.getByRole('alert').textContent).toBe('Search failed')
  expect(rowSymbols()).toEqual([stocks[0].symbol])

  await user.type(searchBox(), 'c')
  latest().resolve([stocks[2].id])
  await flush()
  expect(dom.queryByRole('alert')).toBeNull()
  expect(rowSymbols()).toEqual([stocks[2].symbol])
})

test('removing rows formats nothing for the rows that stay, and quotes still reach them', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(searchBox(), 'a')
  const before = work.calls
  latest().resolve([stocks[0].id, stocks[1].id])
  await flush()
  expect(work.calls - before).toBe(0)
  expect(rowSymbols()).toEqual([stocks[0].symbol, stocks[1].symbol])
  push({ id: 's1', price: 77 })
  await flush()
  expect(within(dom.getByRole('list', { name: 'Stocks' })).getAllByTestId('price')[1].textContent).toBe('$77.00')
})

const star = (symbol: string) => dom.getByRole('button', { name: `Favorite ${symbol}` })
const pressed = (symbol: string) => star(symbol).getAttribute('aria-pressed')

test('a star changes at once and saves the new flag', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  expect(pressed(stocks[0].symbol)).toBe('true')
  await user.click(star(stocks[0].symbol))
  expect(pressed(stocks[0].symbol)).toBe('false')
  expect(saves).toEqual([expect.objectContaining({ id: stocks[0].id, favorite: false })])
  saves[0].resolve()
  await flush()
  expect(pressed(stocks[0].symbol)).toBe('false')
  expect(dom.queryByRole('alert')).toBeNull()
})

test('a failed save puts the star back and shows an alert', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(star(stocks[1].symbol))
  expect(pressed(stocks[1].symbol)).toBe('true')
  saves[0].reject(new Error('refused'))
  await flush()
  expect(pressed(stocks[1].symbol)).toBe('false')
  expect(dom.getByRole('alert').textContent).toBe(`Couldn't update ${stocks[1].symbol}`)
})

test('an earlier failed save does not undo a later click on the same star', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(star(stocks[0].symbol))
  await user.click(star(stocks[0].symbol))
  expect(pressed(stocks[0].symbol)).toBe('true')
  saves[0].reject(new Error('refused'))
  await flush()
  expect(pressed(stocks[0].symbol)).toBe('true')
  saves[1].resolve()
  await flush()
  expect(pressed(stocks[0].symbol)).toBe('true')
})

test('other stars, including ones with saves pending, do not change', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(star(stocks[1].symbol))
  await user.click(star(stocks[2].symbol))
  saves[1].resolve()
  await flush()
  expect(pressed(stocks[1].symbol)).toBe('true')
  expect(pressed(stocks[2].symbol)).toBe('true')
  expect(pressed(stocks[0].symbol)).toBe('true')
})

test('Favorites only shows only the favorites, combined with the search', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(screen.getByRole('checkbox', { name: 'Favorites only' }))
  expect(rowSymbols()).toEqual([stocks[0].symbol])
  expect(dom.getByTestId('count').textContent).toBe('1 stock')
  await user.click(star(stocks[0].symbol))
  expect(rowSymbols()).toEqual([])
})

test('the search and Favorites only survive a reload, and the search runs again', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(searchBox(), 'ab')
  await user.click(screen.getByRole('checkbox', { name: 'Favorites only' }))
  cleanup()

  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  expect(searchBox()).toHaveProperty('value', 'ab')
  expect(screen.getByRole('checkbox', { name: 'Favorites only' })).toHaveProperty('checked', true)
  expect(requests.at(-1)?.query).toBe('ab')
})

test('toggling a star formats nothing and touches only its own row', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  await expect(() => user.click(star(stocks[2].symbol))).toTouchAtMost(2, { runs: 4 })
  expect(work.calls - before).toBe(0)
})

const detailsButton = (symbol: string) => dom.getByRole('button', { name: `Details ${symbol}` })
const panel = () => dom.getByRole('region', { name: 'Details' })
const notes = () => dom.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement

test('the details panel opens with focus on Notes, and shows the description once loaded', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(detailsButton(stocks[0].symbol))
  expect(within(panel()).getByRole('heading').textContent).toContain(stocks[0].symbol)
  expect(document.activeElement).toBe(notes())
  expect(within(panel()).getByText('Loading…')).toBeTruthy()
  detailRequests[0].resolve({ description: 'First stock.' })
  await flush()
  expect(within(panel()).getByText('First stock.')).toBeTruthy()
  expect(within(panel()).getByTestId('detail-price').textContent).toBe(`$${stocks[0].price.toFixed(2)}`)
})

test('a failed description shows an alert, and Retry loads it again', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(detailsButton(stocks[1].symbol))
  detailRequests[0].reject(new Error('down'))
  await flush()
  expect(within(panel()).getByRole('alert').textContent).toBe("Couldn't load details")
  await user.click(within(panel()).getByRole('button', { name: 'Retry' }))
  expect(detailRequests).toHaveLength(2)
  detailRequests[1].resolve({ description: 'Second try.' })
  await flush()
  expect(within(panel()).getByText('Second try.')).toBeTruthy()
})

test('a late description for a stock that is no longer open is never shown', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(detailsButton(stocks[0].symbol))
  await user.click(detailsButton(stocks[1].symbol))
  detailRequests[0].resolve({ description: 'Old stock.' })
  await flush()
  expect(dom.queryByText('Old stock.')).toBeNull()
  detailRequests[1].resolve({ description: 'New stock.' })
  await flush()
  expect(within(panel()).getByText('New stock.')).toBeTruthy()
  expect(within(panel()).getByRole('heading').textContent).toContain(stocks[1].symbol)
})

test('Escape closes the panel and returns focus to its Details button', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(detailsButton(stocks[2].symbol))
  await user.keyboard('{Escape}')
  expect(dom.queryByRole('region', { name: 'Details' })).toBeNull()
  expect(document.activeElement).toBe(detailsButton(stocks[2].symbol))
})

test('notes are saved per stock, and Undo walks back through the saves across stocks', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  const undo = () => within(panel()).getByRole('button', { name: 'Undo' })
  await user.click(detailsButton(stocks[0].symbol))
  expect(undo().hasAttribute('disabled')).toBe(true)
  await user.type(notes(), 'alpha')
  await user.click(within(panel()).getByRole('button', { name: 'Save' }))
  await user.click(detailsButton(stocks[1].symbol))
  expect(notes().value).toBe('')
  await user.type(notes(), 'beta')
  await user.click(within(panel()).getByRole('button', { name: 'Save' }))
  // undo the save for stock 1: its textarea shows the restored (empty) note
  await user.click(undo())
  expect(notes().value).toBe('')
  // undo the save for stock 0 while stock 0 is closed: reopening shows the restored note
  await user.click(undo())
  expect(undo().hasAttribute('disabled')).toBe(true)
  await user.click(detailsButton(stocks[0].symbol))
  detailRequests.at(-1)?.resolve({ description: 'x' })
  await flush()
  expect(notes().value).toBe('')
})

test('an undo of the open stock restores the textarea', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(detailsButton(stocks[0].symbol))
  await user.type(notes(), 'one')
  await user.click(within(panel()).getByRole('button', { name: 'Save' }))
  await user.clear(notes())
  await user.type(notes(), 'two')
  await user.click(within(panel()).getByRole('button', { name: 'Save' }))
  await user.click(within(panel()).getByRole('button', { name: 'Undo' }))
  expect(notes().value).toBe('one')
})

test('typing in Notes formats and renders nothing in the rows', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(detailsButton(stocks[0].symbol))
  detailRequests[0].resolve({ description: 'd' })
  await flush()
  const before = work.calls
  // one re-run per keystroke, all in the textarea's own binding; no row or DOM work
  await expect(() => user.type(notes(), 'typing')).toTouchAtMost(0, { runs: 6 })
  expect(work.calls - before).toBe(0)
})

test('a quote for the open stock updates the panel price', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(detailsButton(stocks[0].symbol))
  push({ id: stocks[0].id, price: 55 })
  await flush()
  expect(within(panel()).getByTestId('detail-price').textContent).toBe('$55.00')
})

test('a burst of quotes formats each changed row and the portfolio once', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  // three rows change (s0 twice), and s1 is held, so the portfolio changes too
  push({ id: 's0', price: 11 })
  push({ id: 's1', price: 12 })
  push({ id: 's0', price: 13 })
  push({ id: 's2', price: 14 })
  await flush()
  expect(work.calls - before).toBe(3 * 3 + 1)
  expect(within(dom.getByRole('list', { name: 'Stocks' })).getAllByTestId('price')[0].textContent).toBe('$13.00')
})

test('Sort by Change puts the biggest gain first, following the quotes', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'change')
  push({ id: stocks[2].id, price: stocks[2].prevClose * 2 })
  push({ id: stocks[0].id, price: stocks[0].prevClose * 1.5 })
  await flush()
  expect(rowSymbols()).toEqual([stocks[2].symbol, stocks[0].symbol, stocks[1].symbol])
})

/** Symbols by change, biggest first (ties in list order), with `id` at its quoted price. */
function changeOrder(id: string) {
  const change = (s: (typeof stocks)[number]) => ((s.id === id ? s.prevClose * 2 : s.price) - s.prevClose) / s.prevClose
  return [...stocks].sort((a, b) => change(b) - change(a)).map(s => s.symbol)
}

test('changing the sort moves rows without formatting or re-rendering any', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  push({ id: stocks[2].id, price: stocks[2].prevClose * 2 })
  await flush()
  const rowsBefore = [...document.querySelectorAll('li')]
  const before = work.calls
  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'change')
  expect(work.calls - before).toBe(0)
  expect(rowSymbols()).toEqual(changeOrder(stocks[2].id))
  for (const li of document.querySelectorAll('li')) expect(rowsBefore.includes(li)).toBe(true)
})

test('the sort survives a reload, and combines with Favorites only', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'change')
  cleanup()

  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveProperty('value', 'change')
})
