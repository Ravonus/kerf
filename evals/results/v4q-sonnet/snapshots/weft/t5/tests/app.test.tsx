// weft-allow T005: the watchlist's acceptance contract names data-testid values (symbol, count, portfolio)
import { screen as dom, within } from '@testing-library/dom'
import { flush, render, screen, user } from 'weft/test'
import { seedStocks, type Api } from '../src/api'
import { work } from '../src/lib/format'
import { App } from '../src/App'

beforeEach(() => { localStorage.clear() })

const stocks = seedStocks(3)
const api: Api = { listStocks: () => Promise.resolve(structuredClone(stocks)), listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]), subscribeQuotes: () => () => {}, search: () => Promise.resolve([]), setFavorite: () => Promise.resolve(), details: id => Promise.resolve({ description: `about ${id}` }) }

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
  const row = dom.getAllByTestId('symbol')[1].closest('li')!
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

test('details panel loads, takes notes with undo, and closes on Escape', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  const opener = screen.getByRole('button', { name: `Details ${stocks[1].symbol}` })
  await user.click(opener)
  const region = screen.getByRole('region', { name: 'Details' })
  expect(within(region).getByText(`about ${stocks[1].id}`)).toBeTruthy()
  const notes = screen.getByLabelText('Notes') as HTMLTextAreaElement
  expect(document.activeElement).toBe(notes)
  await user.type(notes, 'hello')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await user.click(screen.getByRole('button', { name: `Details ${stocks[2].symbol}` }))
  expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('')
  await user.click(screen.getByRole('button', { name: `Details ${stocks[1].symbol}` }))
  expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('hello')
  await user.click(screen.getByRole('button', { name: 'Undo' }))
  expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('')
  expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true)
  await user.click(screen.getByLabelText('Notes'))
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('region', { name: 'Details' })).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: `Details ${stocks[1].symbol}` }))
})

test('bursts append every quote and sorting by change follows quotes', async () => {
  let push: (q: { id: string; price: number }) => void = () => {}
  const burstApi: Api = { ...api, subscribeQuotes: cb => { push = cb; return () => {} } }
  render(App, { api: burstApi })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.selectOptions(screen.getByLabelText('Sort'), 'change')
  for (let i = 0; i < 30; i++) push({ id: stocks[0].id, price: 1000 + i })
  push({ id: stocks[1].id, price: 2000 })
  await flush()
  push({ id: stocks[2].id, price: 1e6 })
  await flush()
  const symbols = () => dom.getAllByTestId('symbol').map(n => n.textContent)
  expect(symbols()).toEqual([stocks[2].symbol, stocks[0].symbol, stocks[1].symbol])
  const first = dom.getAllByTestId('spark')[1].querySelector('path')!.getAttribute('d')!
  expect(first.split('L').length).toBe(20)
  expect(localStorage.getItem('watchlist.sort')).toBe('change')
  await user.selectOptions(screen.getByLabelText('Sort'), 'symbol')
  expect(symbols()).toEqual(stocks.map(s => s.symbol))
})
