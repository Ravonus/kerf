// weft-allow T005: the task spec names data-testid values as the contract for every framework
import { screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { flush, mount, run } from '#adapter'
import { App } from './src/App'
import { work } from './src/lib/format'

export type Stock = { id: string; symbol: string; name: string; sector: string; price: number; prevClose: number; favorite: boolean }
type Quote = { id: string; price: number }

// The tests' own data (the app can't change what tests see). Every stock's change is distinct, 0.05% apart over
// ±5.25% (37 is coprime to 211), and prevClose ≥ 100 keeps cent rounding under 0.005%, so "biggest gain first, ties
// in list order" gives the same order whether an app compares exact or displayed changes. (The first version used
// `(i * 7) % 7`, which is always 0: every stock loaded at -3% and the expected order was cent-rounding noise.)
const words = ['Acme', 'Bolt', 'Cedar', 'Delta', 'Ember', 'Flux', 'Grove', 'Helix', 'Ion', 'Juno']
const kinds = ['Labs', 'Energy', 'Health', 'Capital', 'Systems']
const sectors = ['tech', 'energy', 'health', 'finance']
export const seed = (n = 50): Stock[] =>
  Array.from({ length: n }, (_, i) => {
    const word = words[i % words.length]
    const prevClose = Math.round((100 + ((i * 37) % 290)) * 100) / 100
    return {
      id: `s${i}`, symbol: `${word.slice(0, 3).toUpperCase()}${Math.floor(i / words.length)}`, name: `${word} ${kinds[i % kinds.length]}`,
      sector: sectors[i % sectors.length], price: Math.round(prevClose * (1 + (((i * 37) % 211) - 105) / 2000) * 100) / 100, prevClose, favorite: i % 9 === 0,
    }
  })
export const holdings = [{ id: 's0', qty: 10 }, { id: 's3', qty: 5 }]

/** A promise the test settles; settling flushes the framework. */
function deferred<T>() {
  let res!: (v: T) => void, rej!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => { res = a; rej = b })
  promise.catch(() => {})
  return {
    promise,
    resolve: async (v: T) => { run(() => res(v)); await flush() },
    reject: async (e: unknown = new Error('server error')) => { run(() => rej(e)); await flush() },
  }
}

export function fakeApi(stocks: Stock[] = seed()) {
  const subs = new Set<(q: Quote) => void>()
  const state = { maxSubs: 0 }
  const searches: Array<{ query: string; signal: AbortSignal } & ReturnType<typeof deferred<string[]>>> = []
  const saves: Array<{ id: string; favorite: boolean } & ReturnType<typeof deferred<void>>> = []
  const details: Array<{ id: string } & ReturnType<typeof deferred<{ description: string }>>> = []
  const api = {
    listStocks: () => Promise.resolve(structuredClone(stocks)),
    listHoldings: () => Promise.resolve(structuredClone(holdings)),
    subscribeQuotes: (cb: (q: Quote) => void) => {
      subs.add(cb)
      state.maxSubs = Math.max(state.maxSubs, subs.size)
      return () => { subs.delete(cb) }
    },
    search: (query: string, signal: AbortSignal) => { const d = deferred<string[]>(); searches.push({ query, signal, ...d }); return d.promise },
    setFavorite: (id: string, favorite: boolean) => { const d = deferred<void>(); saves.push({ id, favorite, ...d }); return d.promise },
    details: (id: string) => { const d = deferred<{ description: string }>(); details.push({ id, ...d }); return d.promise },
  }
  const push = async (id: string, price: number) => {
    run(() => { for (const s of [...subs]) s({ id, price }) })
    await flush()
  }
  /** Many quotes delivered synchronously, one `onQuote` call each (ticket 5). */
  const burst = async (quotes: Array<[string, number]>) => {
    run(() => { for (const [id, price] of quotes) for (const s of [...subs]) s({ id, price }) })
    await flush()
  }
  return { api, subs, state, push, burst, searches, saves, details, stocks }
}

export async function start(fake = fakeApi()) {
  const user = userEvent.setup()
  const handle = mount(App as any, { api: fake.api })
  await screen.findByRole('list', { name: 'Stocks' })
  await flush()
  return { fake, user, handle }
}

beforeEach(() => localStorage.clear())

export type User = ReturnType<typeof userEvent.setup>

export const list = () => screen.getByRole('list', { name: 'Stocks' })
export const symbols = () => within(list()).queryAllByTestId('symbol').map(n => n.textContent?.trim())
export const row = (symbol: string) =>
  within(list()).getAllByRole('listitem').find(li => within(li).queryByTestId('symbol')?.textContent?.trim() === symbol)!
export const field = (symbol: string, id: string) => within(row(symbol)).getByTestId(id).textContent?.trim()
export const spark = (symbol: string) => row(symbol).querySelector('[data-testid="spark"] path')?.getAttribute('d')
export const count = () => screen.getByTestId('count').textContent?.trim()
export const tab = (name: string) => screen.getByRole('button', { name, exact: true })
export const portfolio = () => screen.getByTestId('portfolio').textContent?.trim()

// Pure copies of the formatters, so expectations don't count as work.
export const money = (n: number) => `$${n.toFixed(2)}`
export const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
export const change = (price: number, prevClose: number) => pct(((price - prevClose) / prevClose) * 100)
export function path(values: number[], width = 60, height = 16) {
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const step = values.length > 1 ? width / (values.length - 1) : 0
  return values.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`).join(' ')
}

/** A mutation that changed something: nodes added or removed, or an attribute or text whose value differs. */
const effective = (r: MutationRecord) =>
  r.type === 'childList' ||
  (r.type === 'attributes' && (r.target as Element).getAttribute(r.attributeName!) !== r.oldValue) ||
  (r.type === 'characterData' && (r.target as CharacterData).data !== r.oldValue)

/**
 * DOM work and formatter calls caused by `fn` (after the framework settles). DOM work counts effective mutations
 * only, so a framework that rewrites an attribute with its current value (React 19 does for `<input name type>`)
 * isn't charged for it.
 */
export async function cost(fn: () => Promise<unknown>) {
  let dom = 0
  const obs = new MutationObserver(r => { dom += r.filter(effective).length })
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, characterDataOldValue: true })
  const calls = work.calls
  await fn()
  await flush()
  dom += obs.takeRecords().filter(effective).length
  obs.disconnect()
  return { dom, calls: work.calls - calls }
}
export const calls = () => work.calls
