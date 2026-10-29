// weft-allow T005: the watchlist's acceptance contract names data-testid values (symbol, count, portfolio)
import { screen as dom, within } from '@testing-library/dom'
import { flush, render, screen, user } from 'weft/test'; import { work } from '../src/lib/format'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'

const stocks = seedStocks(3)
const api: Api = { listStocks: () => Promise.resolve(structuredClone(stocks)), listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]), search: () => Promise.resolve([]), setFavorite: () => Promise.resolve(), details: () => Promise.resolve({ description: 'd' }), subscribeQuotes: () => () => {} }

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

test('quotes touch only their row', async () => {
  let push: (q: { id: string; price: number }) => void = () => {}
  const live: Api = { ...api, subscribeQuotes: cb => { push = cb; return () => {} } }
  const many = seedStocks(200)
  const big: Api = { ...live, listStocks: () => Promise.resolve(structuredClone(many)) }
  render(App, { api: big })
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  push({ id: 's5', price: 99 })
  await flush()
  expect(work.calls - before).toBeLessThanOrEqual(5)
  expect(dom.getAllByTestId('price')[5].textContent).toBe('$99.00')
  expect(dom.getAllByTestId('spark')).toHaveLength(200)
})

test('search shows latest results, removes rows only', async () => {
  const many = seedStocks(20)
  const resolvers: Record<string, (ids: string[]) => void> = {}
  const signals: Record<string, AbortSignal> = {}
  const s: Api = {
    ...api,
    listStocks: () => Promise.resolve(structuredClone(many)),
    search: (q, signal) => new Promise(res => { resolvers[q] = res; signals[q] = signal }),
  }
  render(App, { api: s })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.type(screen.getByLabelText('Search'), 'ab')
  expect(signals['a'].aborted).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('Searching…')
  resolvers['a'](['s1'])
  await flush()
  expect(screen.getAllByRole('listitem')).toHaveLength(20)
  const before = work.calls
  resolvers['ab'](['s1', 's2'])
  await flush()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(work.calls - before).toBe(0)
  expect(screen.queryByRole('status')).toBeNull()
})

test('favorites toggle, roll back on failure, filter, persist', async () => {
  localStorage.clear()
  const fails = new Set<string>()
  const s: Api = { ...api, listStocks: () => Promise.resolve(structuredClone(stocks)), setFavorite: id => (fails.has(id) ? Promise.reject(new Error('no')) : Promise.resolve()) }
  render(App, { api: s })
  await screen.findByRole('list', { name: 'Stocks' })
  const btn = screen.getByRole('button', { name: `Favorite ${stocks[1].symbol}` })
  const before = work.calls
  await user.click(btn)
  expect(btn.getAttribute('aria-pressed')).toBe('true')
  expect(work.calls - before).toBe(0)
  fails.add('s2')
  const b2 = screen.getByRole('button', { name: `Favorite ${stocks[2].symbol}` })
  await user.click(b2)
  await flush()
  expect(b2.getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('alert').textContent).toBe(`Couldn't update ${stocks[2].symbol}`)
  await user.click(screen.getByLabelText('Favorites only'))
  expect(screen.getAllByRole('listitem').length).toBe(2)
  expect(localStorage.getItem('weft.favoritesOnly')).toBe('1')
})

test('details panel, notes and undo', async () => {
  render(App, { api })
  await screen.findByRole('list', { name: 'Stocks' })
  await user.click(screen.getByRole('button', { name: `Details ${stocks[0].symbol}` }))
  await flush()
  const region = screen.getByRole('region', { name: 'Details' })
  expect(region).toBeTruthy()
  const notes = screen.getByLabelText('Notes') as HTMLTextAreaElement
  expect(document.activeElement).toBe(notes)
  expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(true)
  const before = work.calls
  await user.type(notes, 'hi')
  expect(work.calls - before).toBe(0)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await user.type(notes, '!')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await user.click(screen.getByRole('button', { name: 'Undo' }))
  expect(notes.value).toBe('hi')
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('region', { name: 'Details' })).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: `Details ${stocks[0].symbol}` }))
})

test('bursts and sorting', async () => {
  localStorage.clear()
  const many = seedStocks(50)
  let push: (q: { id: string; price: number }) => void = () => {}
  const s: Api = { ...api, listStocks: () => Promise.resolve(structuredClone(many)), subscribeQuotes: cb => { push = cb; return () => {} } }
  render(App, { api: s })
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  for (let k = 0; k < 40; k++) push({ id: `s${k % 10}`, price: 50 + k })
  await flush()
  expect(work.calls - before).toBeLessThanOrEqual(10 * 3 + 1)
  const symbols = () => dom.getAllByTestId('symbol').map(n => n.textContent)
  const order = symbols()
  const b2 = work.calls
  await user.selectOptions(screen.getByLabelText('Sort'), 'change')
  expect(work.calls - b2).toBe(0)
  expect(symbols()).not.toEqual(order)
  expect(localStorage.getItem('weft.sort')).toBe('change')
  push({ id: 's49', price: 100000 })
  await flush()
  expect(symbols()[0]).toBe(many[49].symbol)
})
