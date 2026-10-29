import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App, seedProducts, type Api, type Product } from '../src/app'
import { RecordingHost } from '../src/recording-host'
import { flush, mount } from '../src/runtime'

let host: RecordingHost
let push: (u: { id: string; price: number }) => void
let unmount: () => void
let seed: Product[]

const settle = async () => { await Promise.resolve(); await Promise.resolve(); flush() }

beforeEach(async () => {
  seed = seedProducts(150)
  const api: Api = {
    listProducts: () => Promise.resolve(structuredClone(seed)),
    subscribePrices: fn => { push = fn; return () => {} },
  }
  host = new RecordingHost()
  unmount = mount(host, () => App({ api }))
  await settle()
})
afterEach(() => unmount())

const rows = () => host.all(n => n.type === 'Button' && String(n.props.label).startsWith('Add '))

describe('shop on the recording host', () => {
  it('renders every product', () => {
    expect(host.byLabel('product-count').props.text).toBe('150 products')
    expect(rows()).toHaveLength(150)
  })

  it('a price push costs exactly one host op, even with the {...p} update habit', async () => {
    const before = host.applies.length
    push({ id: 'p42', price: 9.99 })
    await settle()
    expect(host.applies.length).toBe(before + 1)
    expect(host.lastOps).toBe(1)
    expect(host.byLabel(`${seed[42].name} price`).props.text).toBe('$9.99')
  })

  it('adding to the cart respects stock and updates the header', async () => {
    const p = seed.find(x => x.stock === 2)!
    const add = host.byLabel(`Add ${p.name}`)
    host.tap(add); await settle()
    host.tap(add); await settle()
    expect(host.byLabel('Cart tab').props.text).toBe('Cart (2)')
    expect(add.props.disabled).toBe(true)
    host.tap(add); await settle()
    expect(host.byLabel('Cart tab').props.text).toBe('Cart (2)')
  })

  it('search filters rows and survives a tab switch', async () => {
    host.type(host.byLabel('Search'), 'bagel'); await settle()
    expect(host.byLabel('product-count').props.text).toBe('15 products')
    host.tap(host.byLabel('Cart tab')); await settle()
    host.tap(host.byLabel('Products tab')); await settle()
    expect(host.byLabel('Search').props.value).toBe('bagel')
    expect(host.byLabel('product-count').props.text).toBe('15 products')
  })

  it('fast typing keeps every key while JS echoes arrive late', async () => {
    const field = host.byLabel('Search')
    host.hold()
    for (const key of 'bagel') {
      host.typeKeys(field, key)
      host.releaseOne() // the previous key's echo lands after this keystroke, as on the device
      await settle()
    }
    host.release()
    expect(field.props.value).toBe('bagel')
    expect(host.byLabel('product-count').props.text).toBe('15 products')
  })

  it('sorting by price moves rows without recreating them', async () => {
    const created = () => host.nodes.size
    const n = created()
    host.tap(host.byLabel('Price ↑')); await settle()
    expect(created()).toBe(n)
    const prices = host.all(n => String(n.props.label).endsWith(' price')).map(n => Number(String(n.props.text).slice(1)))
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
  })

  it('cart total follows live prices', async () => {
    const p = seed.find(x => x.stock > 0)!
    host.tap(host.byLabel(`Add ${p.name}`)); await settle()
    host.tap(host.byLabel('Cart tab')); await settle()
    push({ id: p.id, price: 4 }); await settle()
    expect(host.byLabel('total').props.text).toBe('Total $4.00')
  })
})

describe('layout from weft-layout (wasm), same crate as the phones', () => {
  it('every button meets the 44pt touch target', () => {
    for (const b of host.all(n => n.type === 'Button')) expect(host.frame(b.id).h).toBeGreaterThanOrEqual(44)
  })

  it('rows fit the 390pt screen inside the page padding', () => {
    for (const r of host.all(n => n.type === 'Row')) {
      const f = host.frame(r.id)
      expect(f.x).toBeGreaterThanOrEqual(16)
      expect(f.x + f.w).toBeLessThanOrEqual(390 - 16)
    }
  })

  it('the product list scrolls: fixed viewport, content taller than it', () => {
    const s = host.byLabel('Products')
    const f = host.frame(s.id)
    expect(f.y + f.h).toBeLessThanOrEqual(844 - 16)
    expect(f.contentH).toBeGreaterThan(150 * 44)
  })

  it('snapshot is readable', () => {
    expect(host.snapshot().split('\n')[0]).toBe('Stack [0,0 390×844]')
  })
})

describe('op encoding', () => {
  it('round-trips non-ASCII strings without TextEncoder', async () => {
    const { OpWriter, decode } = await import('../src/ops')
    const w = new OpWriter()
    for (const s of ['Price ↑', 'Loading…', 'ü', '🍎 apple', '']) w.setStr(1, 'text', s)
    const values = decode(w.take().bytes).map(o => (o.op === 'SET' ? o.value : null))
    expect(values).toEqual(['Price ↑', 'Loading…', 'ü', '🍎 apple', ''])
  })
})
