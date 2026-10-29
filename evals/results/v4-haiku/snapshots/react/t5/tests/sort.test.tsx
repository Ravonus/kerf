import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

const stocks = seedStocks(12) // favorites: s0 and s9
const change = (s: { price: number; prevClose: number }) => (s.price - s.prevClose) / s.prevClose

function setup() {
  const quote: { cb?: (q: Quote) => void } = {}
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]),
    subscribeQuotes: cb => { quote.cb = cb; return () => {} },
    search: () => Promise.resolve(stocks.map(s => s.id)),
    setFavorite: () => Promise.resolve(),
    details: () => Promise.resolve({ description: 'd' }),
  }
  return { api, quote }
}

beforeEach(() => localStorage.clear())

// Waits for the list and lets subscriptions in its effects attach before the test interacts.
async function ready() {
  await screen.findByRole('list', { name: 'Stocks' })
  await act(async () => {})
}
const shownSymbols = () => within(screen.getByRole('list', { name: 'Stocks' })).queryAllByTestId('symbol').map(n => n.textContent)
const sortSelect = () => screen.getByLabelText('Sort') as HTMLSelectElement
const chooseSort = (value: string) => fireEvent.change(sortSelect(), { target: { value } })

test('symbol order is the default, and change sorts biggest gain first with ties in list order', async () => {
  const { api } = setup()
  render(<App api={api} />)
  await ready()
  expect(sortSelect().value).toBe('symbol')
  expect(shownSymbols()).toEqual(stocks.map(s => s.symbol))
  chooseSort('change')
  const expected = [...stocks].sort((a, b) => change(b) - change(a)).map(s => s.symbol)
  expect(shownSymbols()).toEqual(expected)
})

test('with change selected the order follows the quotes as they arrive', async () => {
  const { api, quote } = setup()
  render(<App api={api} />)
  await ready()
  chooseSort('change')
  act(() => quote.cb!({ id: stocks[11].id, price: stocks[11].prevClose * 2 }))
  expect(shownSymbols()[0]).toBe(stocks[11].symbol)
})

test('a burst formats each changed row once and the portfolio once', async () => {
  const { api, quote } = setup()
  render(<App api={api} />)
  await ready()
  const before = work.calls
  act(() => {
    // Stocks s0 (three quotes), s1 (held, two quotes) and s2 (one quote): three rows and the portfolio change.
    for (const [id, f] of [['s0', 1.01], ['s1', 1.02], ['s0', 1.03], ['s2', 0.99], ['s1', 1.04], ['s0', 1.05]] as const) {
      const s = stocks.find(x => x.id === id)!
      quote.cb!({ id, price: Math.round(s.prevClose * f * 100) / 100 })
    }
  })
  // 3 rows x (money, pct, sparkline) + 1 portfolio money.
  expect(work.calls - before).toBe(10)
})

test('changing the sort formats nothing and keeps every row element', async () => {
  const { api } = setup()
  const { container } = render(<App api={api} />)
  await ready()
  const rows = within(screen.getByRole('list', { name: 'Stocks' })).getAllByRole('listitem')
  const before = work.calls
  chooseSort('change')
  expect(work.calls - before).toBe(0)
  const after = within(screen.getByRole('list', { name: 'Stocks' })).getAllByRole('listitem')
  expect(after.length).toBe(rows.length)
  for (const r of rows) expect(after).toContain(r)
  expect(container.contains(rows[0])).toBe(true)
})

test('sort combines with favorites only and survives a reload', async () => {
  const { api } = setup()
  const first = render(<App api={api} />)
  await ready()
  chooseSort('change')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Favorites only' }))
  first.unmount()

  render(<App api={api} />)
  await ready()
  expect(sortSelect().value).toBe('change')
  expect(screen.getByRole('checkbox', { name: 'Favorites only' })).toHaveProperty('checked', true)
  const favs = stocks.filter(s => s.favorite)
  expect(shownSymbols()).toEqual([...favs].sort((a, b) => change(b) - change(a)).map(s => s.symbol))
})
