import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

const stocks = seedStocks(12) // favorites: s0 and s9

type Save = { id: string; value: boolean; ok: () => void; fail: () => void }

function setup() {
  const saves: Save[] = []
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve([{ id: 's1', qty: 2 }]),
    subscribeQuotes: () => () => {},
    search: (query) => Promise.resolve(stocks.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).map(s => s.id)),
    setFavorite: (id, value) => new Promise<void>((resolve, reject) => {
      saves.push({ id, value, ok: resolve, fail: () => reject(new Error('refused')) })
    }),
  }
  return { api, saves }
}

const star = (symbol: string) => screen.getByRole('button', { name: `Favorite ${symbol}` })
const shownSymbols = () => within(screen.getByRole('list', { name: 'Stocks' })).queryAllByTestId('symbol').map(n => n.textContent)

beforeEach(() => localStorage.clear())

test('a star shows its state and flips at once, then saves', async () => {
  const { api, saves } = setup()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(star(stocks[0].symbol).getAttribute('aria-pressed')).toBe('true')
  expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(star(stocks[1].symbol))
  expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('true')
  expect(saves).toEqual([expect.objectContaining({ id: stocks[1].id, value: true })])
})

test('a failed save puts that star back and shows an alert, and other pending stars are left alone', async () => {
  const { api, saves } = setup()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(star(stocks[1].symbol))
  fireEvent.click(star(stocks[2].symbol))
  await act(async () => saves[0].fail())
  expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
  expect(star(stocks[2].symbol).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('alert').textContent).toBe(`Couldn't update ${stocks[1].symbol}`)
})

test('a failure does not revert a star the user clicked again since', async () => {
  const { api, saves } = setup()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(star(stocks[1].symbol)) // false -> true
  fireEvent.click(star(stocks[1].symbol)) // true -> false
  await act(async () => saves[0].fail())
  expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
  await act(async () => saves[1].ok())
  expect(star(stocks[1].symbol).getAttribute('aria-pressed')).toBe('false')
})

test('favorites only combines with search and survives a reload', async () => {
  const { api } = setup()
  const first = render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Favorites only' }))
  expect(shownSymbols()).toEqual([stocks[0].symbol, stocks[9].symbol])
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: stocks[0].name.split(' ')[0] } })
  await act(async () => {})
  expect(shownSymbols()).toEqual([stocks[0].symbol])
  first.unmount()

  const searchSpy = vi.fn(api.search)
  render(<App api={{ ...api, search: searchSpy }} />)
  await screen.findByRole('list', { name: 'Stocks' })
  expect(screen.getByRole('checkbox', { name: 'Favorites only' })).toHaveProperty('checked', true)
  expect(screen.getByLabelText('Search')).toHaveProperty('value', stocks[0].name.split(' ')[0])
  await act(async () => {})
  expect(searchSpy).toHaveBeenCalledWith(stocks[0].name.split(' ')[0], expect.anything())
  expect(shownSymbols()).toEqual([stocks[0].symbol])
})

test('toggling a star formats nothing', async () => {
  const { api, saves } = setup()
  render(<App api={api} />)
  await screen.findByRole('list', { name: 'Stocks' })
  const before = work.calls
  fireEvent.click(star(stocks[1].symbol))
  await act(async () => saves[0].ok())
  expect(work.calls - before).toBe(0)
})
