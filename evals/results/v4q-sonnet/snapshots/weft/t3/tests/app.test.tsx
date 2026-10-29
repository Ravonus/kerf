// weft-allow T005: the watchlist's acceptance contract names data-testid values (symbol, count, portfolio)
import { screen as dom, within } from '@testing-library/dom'
import { flush, render, screen, user } from 'weft/test'
import { seedStocks, type Api } from '../src/api'
import { work } from '../src/lib/format'
import { App } from '../src/App'

const stocks = seedStocks(3)
const api: Api = { listStocks: () => Promise.resolve(structuredClone(stocks)), listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]), subscribeQuotes: () => () => {}, search: () => Promise.resolve([]), setFavorite: () => Promise.resolve() }

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

test('live quotes update price, sparkline and portfolio, and unsubscribe on unmount', async () => {
  let push: (q: { id: string; price: number }) => void = () => {}
  let subs = 0
  let unsubs = 0
  const live: Api = {
    ...api,
    subscribeQuotes: cb => { subs++; push = cb; return () => { unsubs++ } },
  }
  const view = render(App, { api: live })
  await screen.findByRole('list', { name: 'Stocks' })
  push({ id: 's1', price: 100 })
  push({ id: 's1', price: 110 })
  await flush()
  const row = dom.getAllByTestId('symbol')[1].parentElement!
  expect(within(row).getByTestId('price').textContent).toBe('$110.00')
  expect(within(row).getByTestId('spark').querySelector('path')!.getAttribute('d')).toContain('M0.0,')
  expect(dom.getByTestId('portfolio').textContent).toBe('Portfolio: $220.00')
  const before = work.calls
  push({ id: 's2', price: 50 })
  await flush()
  expect(work.calls - before).toBe(3)
  expect(subs).toBe(1)
  view.unmount()
  expect(unsubs).toBe(1)
})

test('search shows only the latest query and reports failures', async () => {
  const calls: { q: string; signal: AbortSignal; resolve: (ids: string[]) => void; reject: (e: unknown) => void }[] = []
  const searchApi: Api = {
    ...api,
    search: (q, signal) => new Promise((resolve, reject) => { calls.push({ q, signal, resolve, reject }) }),
  }
  render(App, { api: searchApi })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(screen.getByLabelText('Search'), 'ab')
  expect(calls.map(c => c.q)).toEqual(['a', 'ab'])
  expect(calls[0].signal.aborted).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('Searching…')
  calls[1].resolve([stocks[2].id])
  calls[0].resolve([stocks[0].id])
  await flush()
  expect(dom.getByTestId('count').textContent).toBe('1 stock')
  expect(dom.getAllByTestId('symbol').map(n => n.textContent)).toEqual([stocks[2].symbol])
  expect(screen.queryByRole('status')).toBeNull()
  await user.type(screen.getByLabelText('Search'), 'c')
  calls[2].reject(new Error('boom'))
  await flush()
  expect(screen.getByRole('alert').textContent).toBe('Search failed')
  expect(dom.getByTestId('count').textContent).toBe('1 stock')
  await user.clear(screen.getByLabelText('Search'))
  expect(calls.length).toBe(3)
  expect(dom.getByTestId('count').textContent).toBe('3 stocks')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('favorites toggle, roll back on failure, filter and persist', async () => {
  localStorage.clear()
  const rejects: ((e: unknown) => void)[] = []
  const favApi: Api = { ...api, setFavorite: () => new Promise<void>((_, reject) => { rejects.push(reject) }) }
  render(App, { api: favApi })
  await screen.findByRole('list', { name: 'Stocks' })
  const btn = (i: number) => screen.getByRole('button', { name: `Favorite ${stocks[i].symbol}` })
  const was = btn(1).getAttribute('aria-pressed')
  await user.click(btn(1))
  await user.click(btn(2))
  expect(btn(1).getAttribute('aria-pressed')).toBe(was === 'true' ? 'false' : 'true')
  rejects[0](new Error('no'))
  await flush()
  expect(btn(1).getAttribute('aria-pressed')).toBe(was)
  expect(btn(2).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('alert').textContent).toBe(`Couldn't update ${stocks[1].symbol}`)
  await user.click(screen.getByLabelText('Favorites only'))
  expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toContain(`Favorite ${stocks[2].symbol}`)
  expect(localStorage.getItem('watchlist.favoritesOnly')).toBe('true')
})
