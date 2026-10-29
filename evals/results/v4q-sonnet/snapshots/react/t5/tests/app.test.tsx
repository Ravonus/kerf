import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'

const stocks = seedStocks(3)
const api: Api = { listStocks: () => Promise.resolve(structuredClone(stocks)), listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]), subscribeQuotes: () => () => {}, search: () => Promise.resolve([]), setFavorite: () => Promise.resolve(), details: () => Promise.resolve({ description: 'desc' }) }

test('lists stocks after loading', async () => {
  render(<App api={api} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  expect(within(list).getAllByTestId('symbol').map(n => n.textContent)).toEqual(stocks.map(s => s.symbol))
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
})

test('shows the portfolio value', async () => {
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(screen.getByTestId('portfolio').textContent).toBe(`Portfolio: $${(2 * stocks[1].price).toFixed(2)}`)
})

test('live quotes update rows, sparkline and portfolio; unsubscribes on unmount', async () => {
  let push!: (q: { id: string; price: number }) => void
  const unsub = vi.fn()
  const live: Api = { ...api, subscribeQuotes: cb => { push = cb; return unsub } }
  const { unmount } = render(<App api={live} />)
  await screen.findByRole('list', { name: 'Stocks' })
  act(() => push({ id: 's1', price: 50 }))
  expect(screen.getByTestId('portfolio').textContent).toBe('Portfolio: $100.00')
  expect(screen.getAllByTestId('price')[1].textContent).toBe('$50.00')
  expect(screen.getAllByTestId('spark')[1].querySelector('path')!.getAttribute('d')).toMatch(/^M0\.0,/)
  unmount()
  expect(unsub).toHaveBeenCalledTimes(1)
})

test('search shows only the latest query results and handles failure', async () => {
  const calls: { q: string; signal: AbortSignal; resolve: (ids: string[]) => void; reject: (e: unknown) => void }[] = []
  const searchApi: Api = {
    ...api,
    search: (q, signal) => new Promise((resolve, reject) => { calls.push({ q, signal, resolve, reject }) }),
  }
  render(<App api={searchApi} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const input = screen.getByLabelText('Search')
  fireEvent.change(input, { target: { value: 'a' } })
  fireEvent.change(input, { target: { value: 'ab ' } })
  expect(calls.map(c => c.q)).toEqual(['a', 'ab'])
  expect(calls[0].signal.aborted).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('Searching…')
  await act(async () => { calls[0].resolve(['s0']) })
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
  await act(async () => { calls[1].resolve(['s2']) })
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.change(input, { target: { value: 'x' } })
  await act(async () => { calls[2].reject(new Error('x')) })
  expect(screen.getByRole('alert').textContent).toBe('Search failed')
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
  fireEvent.change(input, { target: { value: '' } })
  expect(calls).toHaveLength(3)
  expect(screen.getByTestId('count').textContent).toBe('3 stocks')
})

test('favorites: optimistic, rollback, favorites only, persistence', async () => {
  localStorage.clear()
  const fails: ((e: unknown) => void)[] = []
  const favApi: Api = { ...api, setFavorite: () => new Promise((_, reject) => { fails.push(reject) }) }
  const { unmount } = render(<App api={favApi} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const btn = screen.getByRole('button', { name: `Favorite ${stocks[1].symbol}` })
  const before = btn.getAttribute('aria-pressed')
  fireEvent.click(btn)
  expect(btn.getAttribute('aria-pressed')).not.toBe(before)
  await act(async () => { fails[0](new Error('no')) })
  expect(btn.getAttribute('aria-pressed')).toBe(before)
  expect(screen.getByRole('alert').textContent).toBe(`Couldn't update ${stocks[1].symbol}`)
  fireEvent.click(screen.getByLabelText('Favorites only'))
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zz' } })
  unmount()
  render(<App api={favApi} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect((screen.getByLabelText('Favorites only') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('zz')
  localStorage.clear()
})

test('details panel, notes and undo', async () => {
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const open = screen.getByRole('button', { name: `Details ${stocks[0].symbol}` })
  fireEvent.click(open)
  const region = screen.getByRole('region', { name: 'Details' })
  const notes = within(region).getByLabelText('Notes') as HTMLTextAreaElement
  expect(document.activeElement).toBe(notes)
  expect(await within(region).findByText('desc')).toBeTruthy()
  expect((within(region).getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(notes, { target: { value: 'hello' } })
  fireEvent.click(within(region).getByRole('button', { name: 'Save' }))
  fireEvent.click(within(region).getByRole('button', { name: 'Undo' }))
  expect(notes.value).toBe('')
  fireEvent.keyDown(notes, { key: 'Escape' })
  expect(screen.queryByRole('region', { name: 'Details' })).toBeNull()
  expect(document.activeElement).toBe(open)
})

test('burst quotes and change sort', async () => {
  let push!: (q: { id: string; price: number }) => void
  const live: Api = { ...api, subscribeQuotes: cb => { push = cb; return () => {} } }
  render(<App api={live} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'change' } })
  act(() => {
    push({ id: 's2', price: stocks[2].prevClose * 2 })
    push({ id: 's0', price: stocks[0].prevClose * 3 })
    push({ id: 's0', price: stocks[0].prevClose * 1.5 })
  })
  const syms = screen.getAllByTestId('symbol').map(n => n.textContent)
  expect(syms).toEqual([stocks[2].symbol, stocks[0].symbol, stocks[1].symbol])
  expect(screen.getAllByTestId('spark')).toHaveLength(3)
})
