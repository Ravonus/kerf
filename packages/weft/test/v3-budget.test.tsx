// The v3 shop app's §3.7 work budgets, as tests. Reference app: evals/reference-v3/weft.
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { flush, render, touches } from 'weft/test'
import { App } from '../../../evals/reference-v3/weft/src/App'
import { App as SpreadApp } from './fixtures/v3-spread/App'

type Update = { id: string; price: number }
const cats = ['fruit', 'bakery', 'dairy'] as const
const many = () => Array.from({ length: 150 }, (_, i) => ({
  id: `p${i}`, name: `Item ${String(i).padStart(3, '0')}`, category: cats[i % 3], price: 1 + (i % 17) / 4, stock: 50,
}))

async function start(Comp: typeof App) {
  const subs = new Set<(u: Update) => void>()
  const api = {
    listProducts: () => Promise.resolve(many()),
    subscribePrices: (cb: (u: Update) => void) => (subs.add(cb), () => subs.delete(cb)),
  }
  render(Comp, { api })
  await screen.findByRole('list', { name: 'Products' })
  await flush()
  return { user: userEvent.setup(), push: (id: string, price: number) => { for (const s of subs) s({ id, price }) } }
}

test('price push: 1 DOM mutation, a handful of re-runs', async () => {
  const { push } = await start(App)
  await expect(() => push('p100', 99)).toTouchAtMost(1, { runs: 10 })
  expect(screen.getByText('$99.00')).toBeTruthy()
})

test('add one: at most 3 DOM mutations', async () => {
  const { user } = await start(App)
  await expect(() => user.click(screen.getByRole('button', { name: 'Add Item 007' }))).toTouchAtMost(3)
  expect(screen.getByRole('button', { name: 'Cart (1)' })).toBeTruthy()
})

test('identity-breaking spread (v3 Sonnet habit): still 1 DOM mutation, but every row re-runs', async () => {
  const { push } = await start(SpreadApp)
  const reference = await touches(() => push('p100', 99))
  expect(reference.mutations).toBe(1)
  expect(reference.runs).toBeGreaterThan(150)
  await expect(expect(() => push('p100', 98)).toTouchAtMost(1, { runs: 10 })).rejects.toThrow(/re-runs/)
})

// The same app with the cart in a defineState scope whose rows read one entry each (`lines.get(id)`).
import { App as ScopeApp } from './fixtures/v3-scope/App'

// The reference reads entries with `cart.get(p.id)` since W017; before, its `cart[p.id]` rows re-ran 452 times.
test('add one, cart in a scope with keyed reads: 1 DOM mutation per changed row, no 150-row re-run', async () => {
  const ref = await start(App)
  const before = await touches(() => ref.user.click(screen.getByRole('button', { name: 'Add Item 007' })))
  document.body.innerHTML = ''
  const { user } = await start(ScopeApp)
  const after = await touches(() => user.click(screen.getByRole('button', { name: 'Add Item 007' })))
  console.log(`add one: reference ${before.mutations} DOM · ${before.runs} re-runs; scope + get() ${after.mutations} DOM · ${after.runs} re-runs`)
  expect(screen.getByRole('button', { name: 'Cart (1)' })).toBeTruthy()
  expect(before.runs).toBeLessThanOrEqual(12)
  await expect(() => user.click(screen.getByRole('button', { name: 'Add Item 008' }))).toTouchAtMost(3, { runs: 12 })
})

test('price push and typing are unchanged by the scope', async () => {
  const { push, user } = await start(ScopeApp)
  await expect(() => push('p100', 99)).toTouchAtMost(1, { runs: 10 })
  const t = await touches(() => user.type(screen.getByRole('textbox'), 'ite'))
  console.log(`scope app, type 3 chars: ${t.mutations} DOM · ${t.runs} re-runs`)
})
