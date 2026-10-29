import { render, screen, within, waitFor } from '@solidjs/testing-library'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { work, sparkline } from '../src/lib/format'

const stocks = seedStocks(3)
const holdings = [{ id: 's1', qty: 2 }]

function makeApi() {
  const subs: Array<(q: Quote) => void> = []
  const unsubscribed = { count: 0 }
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve(structuredClone(holdings)),
    subscribeQuotes(onQuote) {
      subs.push(onQuote)
      return () => {
        unsubscribed.count++
      }
    },
  }
  return { api, push: (q: Quote) => subs.forEach(s => s(q)), subs, unsubscribed }
}

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
  expect(within(row).getByTestId('change').textContent).toBe(`${(((100 - s.prevClose) / s.prevClose) * 100) >= 0 ? '+' : ''}${(((100 - s.prevClose) / s.prevClose) * 100).toFixed(2)}%`)
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
