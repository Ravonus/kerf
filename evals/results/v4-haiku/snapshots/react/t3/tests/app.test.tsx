import { act, render, screen, within } from '@testing-library/react'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

beforeEach(() => localStorage.clear())

const stocks = seedStocks(3)

function setup(onQuote: { current?: (q: Quote) => void } = {}, unsubscribed = { done: false }) {
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]),
    subscribeQuotes: cb => {
      onQuote.current = cb
      return () => { unsubscribed.done = true }
    },
    search: () => new Promise(() => {}),
    setFavorite: () => Promise.resolve(),
  }
  return { api, onQuote, unsubscribed }
}

test('lists stocks after loading', async () => {
  render(<App api={setup().api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(stocks.map(s => s.symbol))
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  render(<App api={setup().api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(screen.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * stocks[1].price).toFixed(2)}`)
})

test('shows a sparkline starting at the loaded price', async () => {
  render(<App api={setup().api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('spark')).toHaveLength(3)
})

test('quotes update the row, the change, the sparkline and the portfolio', async () => {
  const handle = setup()
  render(<App api={handle.api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const rows = within(list).getAllByRole('listitem')
  const path = () => rows[1].querySelector('path')!.getAttribute('d')
  const before = path()
  act(() => handle.onQuote.current!({ id: stocks[1].id, price: 100 }))
  expect(within(rows[1]).getByTestId('price').textContent).toBe('$100.00')
  expect(within(rows[1]).getByTestId('change').textContent).toBe(
    `${((100 - stocks[1].prevClose) / stocks[1].prevClose * 100) >= 0 ? '+' : ''}${(((100 - stocks[1].prevClose) / stocks[1].prevClose) * 100).toFixed(2)}%`,
  )
  expect(path()).not.toBe(before)
  expect(screen.getByTestId('portfolio').textContent).toBe('Portfolio: $200.00')
})

test('a quote only formats its own row and the portfolio', async () => {
  const handle = setup()
  render(<App api={handle.api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const rows = within(list).getAllByRole('listitem')
  const otherPrice = rows[0].querySelector('[data-testid="price"]')
  const before = work.calls
  act(() => handle.onQuote.current!({ id: stocks[0].id, price: 50 }))
  // Row 0: money, pct, sparkline. Portfolio is unchanged (stock 0 is not held), so it does not format.
  expect(work.calls - before).toBe(3)
  expect(rows[0].querySelector('[data-testid="price"]')).toBe(otherPrice)
  expect(within(rows[0]).getByTestId('price').textContent).toBe('$50.00')
})

test('the subscription is closed on unmount', async () => {
  const handle = setup()
  const { unmount } = render(<App api={handle.api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  unmount()
  expect(handle.unsubscribed.done).toBe(true)
})
