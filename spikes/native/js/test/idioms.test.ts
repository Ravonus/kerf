import { afterEach, describe, expect, it } from 'vitest'
import table from '../../protocol/idioms.json'
import { App, seedProducts, type Api } from '../src/app'
import { configure, explain, resolve, type Component, type Idiom, type OS } from '../src/platform'
import { RecordingHost } from '../src/recording-host'
import { flush, mount } from '../src/runtime'

const settle = async () => { await Promise.resolve(); await Promise.resolve(); flush() }
let unmount: (() => void) | undefined
let push: (u: { id: string; price: number }) => void

async function render(os: OS, idiom: Idiom = 'blend') {
  configure({ os, idiom })
  const seed = seedProducts(150)
  const api: Api = { listProducts: () => Promise.resolve(structuredClone(seed)), subscribePrices: fn => { push = fn; return () => {} } }
  const host = new RecordingHost(os === 'android' ? 411 : 402, os === 'android' ? 840 : 812)
  host.resize(host.width, host.height)
  unmount = mount(host, () => App({ api }))
  await settle()
  return host
}
afterEach(() => { unmount?.(); unmount = undefined; configure({ os: 'web', idiom: 'blend' }) })

const oses: OS[] = ['web', 'ios', 'android']
const idioms = Object.keys(table.idioms) as Idiom[]
const components = Object.keys(table.components) as Component[]

describe('the idiom table', () => {
  it('resolves every component on every platform and idiom to something that host can draw', () => {
    for (const c of components) for (const os of oses) for (const i of idioms) expect(() => resolve(c, i, os)).not.toThrow()
  })

  it('brand means the same rendering on every platform', () => {
    for (const c of components) expect(new Set(oses.map(os => resolve(c, 'brand', os).render)).size).toBe(1)
  })

  it('a component-level idiom beats the app idiom, and the chain says so', () => {
    configure({ os: 'ios', idiom: 'blend' })
    expect(resolve('Choice').render).toBe('segmented')
    const r = resolve('Choice', 'brand')
    expect(r.render).toBe('warp')
    expect(r.chain[0]).toBe('idiom="brand" on this Choice')
  })

  it('explain prints every platform with its reason', () => {
    const out = explain('AppTabs')
    expect(out).toContain('  ios\n    system  compact tab-bar · medium tab-bar · expanded sidebar · dual spanned')
    expect(out).toContain('    brand   compact header · medium header · expanded header · dual spanned')
    expect(explain('Choice')).toContain('ios      system: segmented  ·  blend: segmented  ·  brand: warp')
    expect(out).toContain('navigation-bar: Android puts top-level sections')
  })
})

describe('one app, three platform forms', () => {
  it('web: section tabs in the header, filters as warp buttons', async () => {
    const host = await render('web')
    expect(host.frame(host.byLabel('Products tab').id).y).toBeLessThan(100)
    expect(host.all(n => n.type === 'Choice')).toHaveLength(0)
    expect(host.byLabel('bakery').props.tone).toBe('plain')
  })

  it('ios: a bottom tab bar and real segmented controls', async () => {
    const host = await render('ios')
    const tab = host.frame(host.byLabel('Products tab').id)
    expect(tab.y + tab.h).toBe(812)
    expect(host.byLabel('Products tab').props.tone).toBe('tab-on')
    const category = host.byLabel('Category')
    expect(category.type).toBe('Choice')
    expect(category.props.options).toBe('all\u001ffruit\u001fbakery\u001fdairy')
    host.select(category, 2)
    await settle()
    expect(category.props.selected).toBe(2)
    expect(host.byLabel('product-count').props.text).toBe('45 products')
  })

  it('android: a bottom navigation bar and choice chips', async () => {
    const host = await render('android')
    const tab = host.frame(host.byLabel('Cart tab').id)
    expect(tab.y + tab.h).toBe(840)
    expect(host.byLabel('Products tab').props.tone).toBe('nav-on')
    expect(host.byLabel('all').props.tone).toBe('chip-on')
    host.tap(host.byLabel('dairy'))
    await settle()
    expect(host.byLabel('dairy').props.tone).toBe('chip-on')
    expect(host.byLabel('all').props.tone).toBe('chip')
  })

  it('brand: the iOS build looks like the web build', async () => {
    const host = await render('ios', 'brand')
    expect(host.frame(host.byLabel('Products tab').id).y).toBeLessThan(100)
    expect(host.all(n => n.type === 'Choice')).toHaveLength(0)
  })

  it('the platform form never costs extra work: a price push is still one op on iOS', async () => {
    const host = await render('ios')
    push({ id: 'p7', price: 1.23 })
    await settle()
    expect(host.lastOps).toBe(1)
  })
})
