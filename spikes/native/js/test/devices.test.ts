// The app on every window in protocol/devices.json: the right form for that platform and size, nothing off screen,
// nothing under a hinge, touch targets at the platform's minimum, and the same behaviour everywhere. Then the live
// cases: a foldable going folded → open → book → tabletop, and phones rotating, with app state kept throughout.
import { afterEach, describe, expect, it } from 'vitest'
import devices from '../../protocol/devices.json'
import { App, seedProducts, type Api } from '../src/app'
import { configure, resolve, type OS, type Rect } from '../src/platform'
import { measureLeaf, RecordingHost, type HNode } from '../src/recording-host'
import { Controls } from '../src/protocol.gen'
import { flush, mount } from '../src/runtime'

type Device = (typeof devices.devices)[number] & { hinge?: Rect }
const all = devices.devices as Device[]

const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve()
  flush()
}
let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  unmount = undefined
  configure({ os: 'web', idiom: 'blend' })
})

async function open(d: Pick<Device, 'os' | 'w' | 'h' | 'hinge'>) {
  configure({ os: d.os as OS, idiom: 'blend' })
  const seed = seedProducts(150)
  const api: Api = {
    listProducts: () => Promise.resolve(structuredClone(seed)),
    subscribePrices: () => () => {},
  }
  const host = new RecordingHost(d.w, d.h)
  host.resize(d.w, d.h, d.hinge)
  unmount = mount(host, () => App({ api }))
  await settle()
  return host
}

const insideScroll = (host: RecordingHost, n: HNode): boolean => {
  for (let p = host.nodes.get(n.parent); p; p = host.nodes.get(p.parent))
    if (p.type === 'Scroll') return true
  return false
}
const overlaps = (a: Rect, b: Rect) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5
const leaves = (host: RecordingHost) =>
  host.all((n) => ['Text', 'Button', 'Input', 'Choice'].includes(n.type))

/** Picks a category the way that platform's control is used: a segment on iOS, a chip or button elsewhere. */
function pickCategory(host: RecordingHost, os: string, index: number, text: string) {
  if (os === 'ios') host.select(host.byLabel('Category'), index)
  else host.tap(host.byLabel(text))
}

describe.each(all.map((d) => [d.id, d] as const))('%s', (_id, d) => {
  it(`picks ${d.expect} (${d.w}×${d.h}${d.hinge ? ', hinge' : ''}, ${d.source})`, async () => {
    await open(d)
    expect(resolve('AppTabs').render).toBe(d.expect)
  })

  it('keeps everything on screen and clear of the hinge, with platform-size touch targets', async () => {
    const host = await open(d)
    const min = Controls.minHeight[d.os as OS]
    for (const n of leaves(host)) {
      const f = host.frame(n.id)
      if (f.w === 0 && f.h === 0) continue // empty caption
      expect(f.x, `${n.type} "${n.props.text ?? n.props.label}" left edge`).toBeGreaterThanOrEqual(
        -0.5,
      )
      expect(
        f.x + f.w,
        `${n.type} "${n.props.text ?? n.props.label}" right edge`,
      ).toBeLessThanOrEqual(d.w + 0.5)
      if (!insideScroll(host, n))
        expect(f.y + f.h, `${n.type} "${n.props.text}" bottom`).toBeLessThanOrEqual(d.h + 0.5)
      if (d.hinge && !insideScroll(host, n))
        expect(
          overlaps(f, d.hinge),
          `${n.type} "${n.props.text ?? n.props.label}" under the hinge`,
        ).toBe(false)
      if (n.type === 'Button' || n.type === 'Input' || n.type === 'Choice')
        expect(f.h).toBeGreaterThanOrEqual(n.type === 'Choice' ? 32 : min)
      if (n.type === 'Button')
        expect(f.w, `"${n.props.text}" button width`).toBeGreaterThanOrEqual(min)
      // A button label never wraps: it gets at least its natural width (the rail's "Produ / cts" bug).
      if (n.type === 'Button')
        expect(f.w, `"${n.props.text}" button width`).toBeGreaterThanOrEqual(
          measureLeaf(n, Infinity)[0] - 0.5,
        )
    }
    if (d.hinge)
      for (const s of host.all((n) => n.type === 'Scroll'))
        expect(overlaps(host.frame(s.id), d.hinge)).toBe(false)
  })

  it('filters, adds to the cart and totals the same way', async () => {
    const host = await open(d)
    pickCategory(host, d.os, 2, 'bakery')
    await settle()
    expect(host.byLabel('product-count').props.text).toBe('45 products')
    host.tap(host.byLabel('Add Bagel 10'))
    await settle()
    // Spanned windows show the cart beside the list; everywhere else it's one tap away.
    if (d.expect !== 'spanned') {
      host.tap(host.byLabel('Cart tab'))
      await settle()
    }
    expect(host.byLabel('total').props.text).toBe('Total $0.45')
  })
})

describe('window changes are live', () => {
  const fold = (id: string) => all.find((d) => d.id === id)!

  it('a foldable going folded → open → book → tabletop → folded keeps filters, cart and tab', async () => {
    const host = await open(fold('fold-cover'))
    pickCategory(host, 'android', 2, 'bakery')
    host.tap(host.byLabel('Add Bagel 10'))
    await settle()
    host.tap(host.byLabel('Cart tab'))
    await settle()

    const steps: [string, string][] = [
      ['fold-open-flat', 'navigation-rail'],
      ['fold-book', 'spanned'],
      ['fold-tabletop', 'spanned'],
      ['fold-cover', 'navigation-bar'],
    ]
    for (const [id, form] of steps) {
      const d = fold(id)
      host.resize(d.w, d.h, d.hinge)
      await settle()
      expect(resolve('AppTabs').render, id).toBe(form)
      expect(host.byLabel('total').props.text, id).toBe('Total $0.45')
      if (form === 'spanned')
        expect(host.byLabel('product-count').props.text, id).toBe('45 products') // the list is beside the cart
    }
    // Back on the cover screen the user is still on the cart tab they chose before unfolding.
    expect(host.all((n) => n.props.label === 'Cart tab')[0].props.tone).toBe('nav-on')
  })

  it('rotating a phone or iPad re-resolves only when the class changes', async () => {
    const host = await open(fold('pixel-8'))
    const before = host.applies.length
    host.resize(411.43, 800) // keyboard-ish height change: same class, no new structure
    await settle()
    expect(host.applies.length).toBe(before)
    const land = fold('pixel-8-land')
    host.resize(land.w, land.h)
    await settle()
    const rail = host.frame(host.byLabel('Sections').id)
    expect(rail).toMatchObject({ x: 0, y: 0, w: 112 })
    expect(Math.abs(rail.h - land.h)).toBeLessThanOrEqual(0.5) // full height, to layout rounding

    unmount?.()
    const ipad = fold('ipad-pro-13-land')
    const ih = await open({ ...ipad, w: 820, h: 1136 })
    expect(resolve('AppTabs').render).toBe('tab-bar')
    ih.resize(ipad.w, ipad.h)
    await settle()
    expect(resolve('AppTabs').render).toBe('sidebar')
    expect(ih.frame(ih.byLabel('Sections').id)).toMatchObject({ x: 0, w: 280 })
  })

  it('a Surface Duo spanned puts each section on its own screen, split exactly at the hinge', async () => {
    const d = fold('surface-duo-spanned')
    const host = await open(d)
    const [left, hinge, right] = host.byLabel('Panes').children.map((id) => host.frame(id))
    // weft-layout rounds to whole layout units, so edges land within half a unit of the hinge's.
    const near = (got: number, want: number) =>
      expect(Math.abs(got - want)).toBeLessThanOrEqual(0.5)
    near(left.x, 0)
    near(left.x + left.w, 540)
    near(hinge.x, 540)
    near(hinge.x + hinge.w, 573.6)
    near(right.x, 573.6)
    near(right.x + right.w, 1113.6)
    expect(host.all((n) => n.props.label === 'Sections')).toHaveLength(0) // no tab control: both sections are showing
  })
})
