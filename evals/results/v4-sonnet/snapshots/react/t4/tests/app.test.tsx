import { render, screen, within } from '@testing-library/react'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'

const stocks = seedStocks(3)
const api: Api = { listStocks: () => Promise.resolve(structuredClone(stocks)), listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]), subscribeQuotes: () => () => {}, search: () => Promise.resolve([]), setFavorite: () => Promise.resolve(), details: () => Promise.resolve({ description: 'd' }) }

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

test('live quotes update only the affected row', async () => {
  const { act } = await import('@testing-library/react')
  const { work } = await import('../src/lib/format')
  let push!: (q: { id: string; price: number }) => void
  const unsub = vi.fn()
  const live: Api = { ...api, subscribeQuotes: cb => { push = cb; return unsub } }
  const { unmount } = render(<App api={live} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  act(() => push({ id: 's1', price: 50 }))
  expect(work.calls - before).toBe(4) // price, change, sparkline, portfolio
  expect(screen.getByTestId('portfolio').textContent).toBe('Portfolio: $100.00')
  expect(screen.getAllByTestId('spark')).toHaveLength(3)
  unmount()
  expect(unsub).toHaveBeenCalledTimes(1)
})

test('search shows only the latest query and aborts older ones', async () => {
  const { fireEvent, act } = await import('@testing-library/react')
  const calls: { q: string; signal: AbortSignal; res: (v: string[]) => void; rej: (e: unknown) => void }[] = []
  const live: Api = { ...api, search: (q, signal) => new Promise((res, rej) => { calls.push({ q, signal, res, rej }) }) }
  render(<App api={live} />)
  const list = await screen.findByRole('list', { name: 'Stocks' })
  const input = screen.getByLabelText('Search')
  fireEvent.change(input, { target: { value: 'a' } })
  fireEvent.change(input, { target: { value: 'ab ' } })
  expect(calls.map(c => c.q)).toEqual(['a', 'ab'])
  expect(calls[0].signal.aborted).toBe(true)
  expect(screen.getByRole('status').textContent).toBe('Searching…')
  await act(async () => calls[1].res(['s2']))
  expect(within(list).getAllByTestId('symbol')).toHaveLength(1)
  expect(screen.getByTestId('count').textContent).toBe('1 stock')
  fireEvent.change(input, { target: { value: 'abc' } })
  await act(async () => calls[2].rej(new Error('x')))
  expect(screen.getByRole('alert').textContent).toBe('Search failed')
  expect(within(list).getAllByTestId('symbol')).toHaveLength(1)
  fireEvent.change(input, { target: { value: '' } })
  expect(within(list).getAllByTestId('symbol')).toHaveLength(3)
  expect(calls).toHaveLength(3)
})

test('favorites: optimistic, rollback, filter, persistence', async () => {
  const { fireEvent, act } = await import('@testing-library/react')
  const { work } = await import('../src/lib/format')
  localStorage.clear()
  const saves: { res: () => void; rej: () => void }[] = []
  const live: Api = { ...api, setFavorite: () => new Promise((res, rej) => { saves.push({ res: () => res(), rej: () => rej(new Error('no')) }) }) }
  const { unmount } = render(<App api={live} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const btn = screen.getByRole('button', { name: `Favorite ${stocks[1].symbol}` })
  const was = btn.getAttribute('aria-pressed')
  const before = work.calls
  fireEvent.click(btn)
  expect(btn.getAttribute('aria-pressed')).not.toBe(was)
  expect(work.calls).toBe(before)
  await act(async () => saves[0].rej())
  expect(btn.getAttribute('aria-pressed')).toBe(was)
  expect(screen.getByRole('alert').textContent).toBe(`Couldn't update ${stocks[1].symbol}`)
  fireEvent.click(btn); fireEvent.click(btn)
  await act(async () => saves[1].rej())
  expect(btn.getAttribute('aria-pressed')).toBe(was) // second click flipped back; no rollback of first
  fireEvent.click(screen.getByLabelText('Favorites only'))
  unmount()
  render(<App api={live} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect((screen.getByLabelText('Favorites only') as HTMLInputElement).checked).toBe(true)
})

test('details panel: late response, focus, notes undo', async () => {
  localStorage.clear()
  const { fireEvent, act } = await import('@testing-library/react')
  const { work } = await import('../src/lib/format')
  const reqs: Record<string, (v: { description: string }) => void> = {}
  const live: Api = { ...api, details: id => new Promise(res => { reqs[id] = res }) }
  render(<App api={live} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const b0 = screen.getByRole('button', { name: `Details ${stocks[0].symbol}` })
  fireEvent.click(b0)
  fireEvent.click(screen.getByRole('button', { name: `Details ${stocks[1].symbol}` }))
  await act(async () => reqs.s0({ description: 'late' }))
  expect(screen.queryByText('late')).toBeNull()
  await act(async () => reqs.s1({ description: 'fresh' }))
  expect(screen.getByText('fresh')).toBeTruthy()
  const region = screen.getByRole('region', { name: 'Details' })
  const notes = within(region).getByLabelText('Notes') as HTMLTextAreaElement
  expect(document.activeElement).toBe(notes)
  const before = work.calls
  fireEvent.change(notes, { target: { value: 'hello' } })
  expect(work.calls).toBe(before)
  const undo = within(region).getByRole('button', { name: 'Undo' }) as HTMLButtonElement
  expect(undo.disabled).toBe(true)
  fireEvent.click(within(region).getByRole('button', { name: 'Save' }))
  fireEvent.change(notes, { target: { value: 'bye' } })
  fireEvent.click(within(region).getByRole('button', { name: 'Save' }))
  fireEvent.click(undo)
  expect(notes.value).toBe('hello')
  fireEvent.keyDown(notes, { key: 'Escape' })
  expect(screen.queryByRole('region', { name: 'Details' })).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: `Details ${stocks[1].symbol}` }))
})
