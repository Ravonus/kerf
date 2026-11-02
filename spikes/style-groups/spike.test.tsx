// Style groups spike (research 23 §6): the same interactions on the hand-CSS shop and the groups shop. Runs in the
// eval's weft framework next to the hidden tests (run.mjs copies it in). Writes what it measured to SPIKE_OUT and
// asserts the pass bar: one attribute write per axis change, and no more DOM work than the class version.
// weft-allow T005: measures DOM mutations and serialized markup; the DOM is the subject
import { screen, within } from '@testing-library/dom'
import { writeFileSync } from 'node:fs'
import { touches } from '@weft-js/core/test'
import { start, type Product } from './helpers'

const out: Record<string, unknown> = {}
afterAll(() => { if (process.env.SPIKE_OUT) writeFileSync(process.env.SPIKE_OUT, JSON.stringify(out, null, 2)) })

const products = (): Product[] => [
  { id: 'apple', name: 'Apple', category: 'fruit', price: 0.5, stock: 20 },
  { id: 'banana', name: 'Banana', category: 'fruit', price: 0.25, stock: 4 },
  { id: 'brioche', name: 'Brioche', category: 'bakery', price: 3.5, stock: 1 },
  { id: 'yogurt', name: 'Yogurt', category: 'dairy', price: 0.9, stock: 0 },
]

/** Attribute mutations by name, from a list of MutationRecords. */
async function record(fn: () => Promise<unknown>) {
  const records: MutationRecord[] = []
  const obs = new MutationObserver(r => records.push(...r))
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
  const t = await touches(fn)
  records.push(...obs.takeRecords())
  obs.disconnect()
  const attrs = records.filter(r => r.type === 'attributes').map(r => r.attributeName)
  return { mutations: t.mutations, added: t.added, removed: t.removed, text: t.text, attributes: t.attributes, runs: t.runs, attrs }
}

test('markup snapshots for counting (catalogue, then cart with a moved price)', async () => {
  const { user, fake } = await start(products())
  out.catalog = document.body.innerHTML
  await user.click(screen.getByRole('button', { name: 'Add Banana' }))
  await user.click(screen.getByRole('button', { name: 'Add Apple' }))
  await fake.push('banana', 0.3)
  await user.click(screen.getByRole('button', { name: /^Cart/ }))
  out.cart = document.body.innerHTML
  expect(screen.getByTestId('price-change').textContent).toBe('Price up')
})

test('stock change (in → low): the axis is one attribute write', async () => {
  const { user } = await start(products())
  const row = screen.getByRole('button', { name: 'Add Banana' }).closest('li')!
  const r = await record(() => user.click(screen.getByRole('button', { name: 'Add Banana' })))
  out.stockChange = r
  expect(within(row).getByText('Only 3 left')).toBeTruthy()
  const axis = r.attrs.filter(a => a !== 'disabled')
  expect(axis.length).toBeLessThanOrEqual(1)
})

test('price push in the catalogue: 1 DOM mutation (text)', async () => {
  const { fake } = await start(products())
  const r = await record(() => fake.push('apple', 0.75))
  out.pricePush = r
  expect(r.mutations).toBe(1)
})

test('price push in the cart (trend same → up): the axis is one attribute write', async () => {
  const { user, fake } = await start(products())
  await user.click(screen.getByRole('button', { name: 'Add Apple' }))
  await user.click(screen.getByRole('button', { name: /^Cart/ }))
  const r = await record(() => fake.push('apple', 0.75))
  out.trendChange = r
  expect(screen.getByTestId('price-change').textContent).toBe('Price up')
  expect(r.attrs.length).toBeLessThanOrEqual(1)
})

test('tab switch: one aria-pressed write per tab, plus the view swap', async () => {
  const { user } = await start(products())
  const r = await record(() => user.click(screen.getByRole('button', { name: /^Cart/ })))
  // The class version writes weft's boolean `true` as aria-pressed=""; groups write ARIA states as "true"/"false".
  const pressed = screen.getByRole('button', { name: /^Cart/ }).getAttribute('aria-pressed')
  out.tabSwitch = { ...r, pressed }
  expect(pressed).not.toBeNull()
})
