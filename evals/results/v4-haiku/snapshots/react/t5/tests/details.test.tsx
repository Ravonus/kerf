import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { seedStocks, type Api, type Quote } from '../src/api'
import { App } from '../src/App'
import { work } from '../src/lib/format'

const stocks = seedStocks(4)

type Req = { id: string; ok: (text: string) => void; fail: () => void }

function setup() {
  const reqs: Req[] = []
  const quote: { cb?: (q: Quote) => void } = {}
  const api: Api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve([]),
    subscribeQuotes: cb => { quote.cb = cb; return () => {} },
    search: () => Promise.resolve(stocks.map(s => s.id)),
    setFavorite: () => Promise.resolve(),
    details: id => new Promise<{ description: string }>((resolve, reject) => {
      reqs.push({ id, ok: text => resolve({ description: text }), fail: () => reject(new Error('down')) })
    }),
  }
  return { api, reqs, quote }
}

const open = (symbol: string) => fireEvent.click(screen.getByRole('button', { name: `Details ${symbol}` }))
const panel = () => screen.getByRole('region', { name: 'Details' })
const notesBox = () => within(panel()).getByLabelText('Notes') as HTMLTextAreaElement

beforeEach(() => localStorage.clear())

// Waits for the list and lets subscriptions in its effects attach before the test interacts.
async function ready() {
  await screen.findByRole('list', { name: 'Stocks' })
  await act(async () => {})
}

test('opening a stock shows its heading, live price, and a description that loads', async () => {
  const { api, reqs, quote } = setup()
  render(<App api={api} />)
  await ready()
  open(stocks[1].symbol)
  expect(within(panel()).getByRole('heading').textContent).toContain(stocks[1].name)
  expect(within(panel()).getByText('Loading…')).toBeTruthy()
  expect(document.activeElement).toBe(notesBox())
  await act(async () => reqs[0].ok('About B'))
  expect(within(panel()).getByText('About B')).toBeTruthy()
  act(() => quote.cb!({ id: stocks[1].id, price: 77 }))
  expect(within(panel()).getByTestId('detail-price').textContent).toBe('$77.00')
})

test('escape closes the panel and returns focus to its Details button', async () => {
  const { api, reqs } = setup()
  render(<App api={api} />)
  await ready()
  open(stocks[0].symbol)
  await act(async () => reqs[0].ok('x'))
  fireEvent.keyDown(notesBox(), { key: 'Escape' })
  expect(screen.queryByRole('region', { name: 'Details' })).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: `Details ${stocks[0].symbol}` }))
})

test('a failed description shows an alert and Retry loads it again', async () => {
  const { api, reqs } = setup()
  render(<App api={api} />)
  await ready()
  open(stocks[0].symbol)
  await act(async () => reqs[0].fail())
  expect(within(panel()).getByRole('alert').textContent).toBe("Couldn't load details")
  fireEvent.click(within(panel()).getByRole('button', { name: 'Retry' }))
  expect(reqs).toHaveLength(2)
  await act(async () => reqs[1].ok('now loaded'))
  expect(within(panel()).getByText('now loaded')).toBeTruthy()
})

test('a late description for a stock that is no longer open is never shown', async () => {
  const { api, reqs } = setup()
  render(<App api={api} />)
  await ready()
  open(stocks[0].symbol)
  open(stocks[1].symbol)
  await act(async () => reqs[1].ok('about B'))
  await act(async () => reqs[0].ok('about A'))
  expect(within(panel()).getByText('about B')).toBeTruthy()
  expect(screen.queryByText('about A')).toBeNull()
})

test('save and undo walk back across stocks, and the textarea follows the open stock', async () => {
  const { api, reqs } = setup()
  render(<App api={api} />)
  await ready()
  open(stocks[0].symbol)
  await act(async () => reqs[0].ok('x'))
  const undo = () => within(panel()).getByRole('button', { name: 'Undo' }) as HTMLButtonElement
  expect(undo().disabled).toBe(true)
  fireEvent.change(notesBox(), { target: { value: 'first A' } })
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }))
  open(stocks[1].symbol)
  await act(async () => reqs[1].ok('y'))
  fireEvent.change(notesBox(), { target: { value: 'B note' } })
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }))
  expect(undo().disabled).toBe(false)
  fireEvent.click(undo()) // undoes B's save
  expect(notesBox().value).toBe('')
  fireEvent.click(undo()) // undoes A's save, which is not open
  expect(undo().disabled).toBe(true)
  open(stocks[0].symbol)
  await act(async () => reqs[2].ok('x'))
  expect(notesBox().value).toBe('')
})

test('undo restores the open stock textarea to the note it had', async () => {
  const { api, reqs } = setup()
  render(<App api={api} />)
  await ready()
  open(stocks[0].symbol)
  await act(async () => reqs[0].ok('x'))
  fireEvent.change(notesBox(), { target: { value: 'one' } })
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }))
  fireEvent.change(notesBox(), { target: { value: 'two' } })
  fireEvent.click(within(panel()).getByRole('button', { name: 'Save' }))
  fireEvent.click(within(panel()).getByRole('button', { name: 'Undo' }))
  expect(notesBox().value).toBe('one')
})

test('typing in notes formats and renders no row', async () => {
  const { api, reqs } = setup()
  render(<App api={api} />)
  await ready()
  open(stocks[0].symbol)
  await act(async () => reqs[0].ok('x'))
  const before = work.calls
  fireEvent.change(notesBox(), { target: { value: 'typing' } })
  expect(work.calls - before).toBe(0)
})
