import { render, screen, within, waitFor } from '@solidjs/testing-library'
import { work } from '../src/lib/format'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'

const stocks = seedStocks(3)
const api: Api = { listStocks: () => Promise.resolve(structuredClone(stocks)), listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]), subscribeQuotes: () => () => {}, search: () => Promise.resolve([]), setFavorite: () => Promise.resolve() }

test('lists stocks after loading', async () => {
  render(() => <App api={api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(stocks.map(s => s.symbol))
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  render(() => <App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(screen.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * stocks[1].price).toFixed(2)}`)
})

test('live quotes update only the affected row and the portfolio', async () => {
  let push!: (q: { id: string; price: number }) => void
  let unsubs = 0
  const live: Api = { ...api, subscribeQuotes: cb => { push = cb; return () => { unsubs++ } } }
  const { unmount } = render(() => <App api={live} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  push({ id: 's1', price: 100 })
  await waitFor(() => expect(screen.getByTestId('portfolio').textContent).toBe('Portfolio: $200.00'))
  expect(work.calls - before).toBeLessThanOrEqual(4)
  expect(within(list).getAllByTestId('price')[1].textContent).toBe('$100.00')
  expect(within(list).getAllByTestId('spark')[1].querySelector('path')!.getAttribute('d')).toContain('L')
  unmount()
  expect(unsubs).toBe(1)
})

test('search shows only the latest query, aborts stale ones, reports failure', async () => {
  const reqs: { q: string; signal: AbortSignal; res: (v: string[]) => void; rej: (e: unknown) => void }[] = []
  const a: Api = { ...api, search: (q, signal) => new Promise((res, rej) => { reqs.push({ q, signal, res, rej }) }) }
  render(() => <App api={a} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const input = screen.getByLabelText('Search') as HTMLInputElement
  const type = (v: string) => { input.value = v; input.dispatchEvent(new InputEvent('input', { bubbles: true })) }
  type('a'); type('ab ')
  expect(reqs.map(r => r.q)).toEqual(['a', 'ab'])
  expect(reqs[0].signal.aborted).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('Searching…')
  reqs[1].res([stocks[2].id])
  reqs[0].res([stocks[0].id])
  await waitFor(() => expect(within(list).getAllByTestId('symbol')).toHaveLength(1))
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
  expect(screen.queryByRole('status')).toBeNull()
  type('abc')
  reqs[2].rej(new Error('x'))
  await screen.findByRole('alert')
  expect(within(list).getAllByTestId('symbol')).toHaveLength(1)
  type('')
  expect(reqs).toHaveLength(3)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(within(list).getAllByTestId('symbol')).toHaveLength(3)
})

test('favorites: optimistic, rollback only if not re-clicked, filter, persistence', async () => {
  localStorage.clear()
  const calls: { rej: (e: unknown) => void }[] = []
  const a: Api = { ...api, setFavorite: () => new Promise<void>((_, rej) => { calls.push({ rej }) }) }
  const { unmount } = render(() => <App api={a} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const sym = stocks[1].symbol
  const btn = screen.getByRole('button', { name: `Favorite ${sym}` })
  const other = screen.getByRole('button', { name: `Favorite ${stocks[2].symbol}` })
  expect(btn.getAttribute('aria-pressed')).toBe('false')
  btn.click(); other.click()
  await waitFor(() => expect(btn.getAttribute('aria-pressed')).toBe('true'))
  calls[0].rej(new Error('no'))
  await screen.findByRole('alert')
  expect(btn.getAttribute('aria-pressed')).toBe('false')
  expect(other.getAttribute('aria-pressed')).toBe('true')
  const cb = screen.getByLabelText('Favorites only') as HTMLInputElement
  cb.click()
  await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2 stocks'))
  expect(localStorage.getItem('watchlist.favOnly')).toBe('1')
  unmount()
  render(() => <App api={a} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect((screen.getByLabelText('Favorites only') as HTMLInputElement).checked).toBe(true)
  localStorage.clear()
})
