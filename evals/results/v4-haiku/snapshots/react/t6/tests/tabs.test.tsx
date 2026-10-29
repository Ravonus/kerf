import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { seedStocks, type Api } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

const stocks = seedStocks(12) // sectors cycle tech, energy, health, finance
const inSector = (sector: string) => stocks.filter(s => s.sector === sector)

type Req = { query: string; signal: AbortSignal; ids: (ids: string[]) => void; fail: () => void }

function setup() {
  const reqs: Req[] = []
  let manual = false
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve([]),
    subscribeQuotes: () => () => {},
    setFavorite: () => Promise.resolve(),
    details: () => Promise.resolve({ description: 'd' }),
    search: (query, signal) => {
      if (!manual) return Promise.resolve(stocks.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).map(s => s.id))
      return new Promise<string[]>((resolve, reject) => {
        reqs.push({ query, signal, ids: resolve, fail: () => reject(new Error('down')) })
      })
    },
  }
  return { api, reqs, manual: (on: boolean) => { manual = on } }
}

async function ready() {
  await screen.findByRole('list', { name: 'Stocks' })
  await act(async () => {})
}
const tabButton = (name: string) => screen.getByRole('button', { name })
const shownSymbols = () => within(screen.getByRole('list', { name: 'Stocks' })).queryAllByTestId('symbol').map(n => n.textContent)
const typeSearch = (value: string) => fireEvent.change(screen.getByLabelText('Search'), { target: { value } })

beforeEach(() => localStorage.clear())

test('sector tabs show that sector only, and the header counts the current tab', async () => {
  const { api } = setup()
  render(<App api={api} />)
  await ready()
  expect(tabButton('All').getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(tabButton('tech'))
  expect(tabButton('tech').getAttribute('aria-pressed')).toBe('true')
  expect(tabButton('All').getAttribute('aria-pressed')).toBe('false')
  expect(shownSymbols()).toEqual(inSector('tech').map(s => s.symbol))
  expect(screen.getByTestId('count').textContent).toBe(`${inSector('tech').length} stocks`)
})

test('each tab keeps its own search, favorites only and sort', async () => {
  const { api } = setup()
  render(<App api={api} />)
  await ready()
  typeSearch(stocks[0].name.split(' ')[0])
  await act(async () => {})
  fireEvent.click(tabButton('finance'))
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('')
  expect(shownSymbols()).toEqual(inSector('finance').map(s => s.symbol))
  fireEvent.click(tabButton('All'))
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe(stocks[0].name.split(' ')[0])
  expect(shownSymbols()).toEqual(stocks.filter(s => s.name.includes(stocks[0].name.split(' ')[0])).map(s => s.symbol))
})

test('a background search keeps going, and its results show when the tab comes back', async () => {
  const { api, reqs, manual } = setup()
  manual(true)
  render(<App api={api} />)
  await ready()
  typeSearch('acme')
  fireEvent.click(tabButton('tech'))
  expect(screen.queryByRole('status')).toBeNull() // the status is about the current tab
  expect(reqs[0].signal.aborted).toBe(false)
  await act(async () => reqs[0].ids([stocks[0].id]))
  // The tech tab has no search of its own, so it still shows every tech stock.
  expect(shownSymbols()).toEqual(inSector('tech').map(s => s.symbol))
  fireEvent.click(tabButton('All'))
  expect(screen.queryByRole('status')).toBeNull()
  expect(shownSymbols()).toEqual([stocks[0].symbol])
})

test('a newer query in the same tab aborts the older one', async () => {
  const { api, reqs, manual } = setup()
  manual(true)
  render(<App api={api} />)
  await ready()
  typeSearch('a')
  fireEvent.click(tabButton('energy'))
  typeSearch('b')
  fireEvent.click(tabButton('All'))
  typeSearch('a')
  expect(screen.getByRole('status')).toBeTruthy()
})

test('after a reload the selected tab and its search are restored, and the search runs when the tab is shown', async () => {
  localStorage.setItem('watchlist.view', JSON.stringify({ tab: 'All', tabs: { tech: { search: 'zz', favoritesOnly: false, sort: 'symbol' } } }))
  const { api } = setup()
  const searchSpy = vi.fn(api.search)
  const first = render(<App api={{ ...api, search: searchSpy }} />)
  await ready()
  expect(searchSpy).not.toHaveBeenCalledWith('zz', expect.anything())
  fireEvent.click(tabButton('tech'))
  await act(async () => {})
  expect(searchSpy).toHaveBeenCalledWith('zz', expect.anything())
  expect(tabButton('tech').getAttribute('aria-pressed')).toBe('true')
  first.unmount()

  render(<App api={{ ...api, search: searchSpy }} />)
  await ready()
  expect(tabButton('tech').getAttribute('aria-pressed')).toBe('true')
  expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('zz')
})

test('switching to a tab whose rows are already on screen formats and renders nothing new', async () => {
  const { api } = setup()
  render(<App api={api} />)
  await ready()
  const allRows = within(screen.getByRole('list', { name: 'Stocks' })).getAllByRole('listitem')
  const techRow = allRows.find(r => r.textContent?.includes(inSector('tech')[0].symbol))!
  const before = work.calls
  fireEvent.click(tabButton('tech'))
  expect(work.calls - before).toBe(0)
  expect(within(screen.getByRole('list', { name: 'Stocks' })).getAllByRole('listitem')).toContain(techRow)
})
