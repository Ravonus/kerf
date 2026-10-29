import { render, screen, within } from '@solidjs/testing-library'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

const stocks = seedStocks(3)

/** An api whose quotes the test pushes by hand. */
function liveApi() {
  const sub = { onQuote: undefined as ((q: Quote) => void) | undefined, unsubscribed: 0 }
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]),
    subscribeQuotes(onQuote) {
      sub.onQuote = onQuote
      return () => {
        sub.unsubscribed++
        sub.onQuote = undefined
      }
    },
  }
  return { api, push: (q: Quote) => sub.onQuote!(q), sub }
}

const row = (i: number) => within(screen.getByRole('list', { name: 'Stocks' }).children[i] as HTMLElement)

test('lists stocks after loading', async () => {
  render(() => <App api={liveApi().api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(stocks.map(s => s.symbol))
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
