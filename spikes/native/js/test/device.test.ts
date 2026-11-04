// The `weft device` protocol as the Node host answers it. The phones answer the same requests with the same shapes
// (DevServer.swift, DevServer.kt); scripts/device.mts drives all three.
import { afterEach, describe, expect, it } from 'vitest'
import { App, seedProducts, type Api } from '../src/app'
import { render, type SnapNode, type Snapshot } from '../src/device'
import { configure, type OS } from '../src/platform'
import { RecordingHost } from '../src/recording-host'
import { flush, mount } from '../src/runtime'

let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  unmount = undefined
  configure({ os: 'web', idiom: 'blend' })
})

async function open(os: OS, w = 402, h = 778) {
  configure({ os })
  const host = new RecordingHost(w, h)
  host.resize(w, h)
  const seed = seedProducts(150)
  const api: Api = {
    listProducts: () => Promise.resolve(structuredClone(seed)),
    subscribePrices: () => () => {},
  }
  unmount = mount(host, () => App({ api }))
  for (let i = 0; i < 4; i++) await Promise.resolve()
  flush()
  return host
}
const flat = (n: SnapNode): SnapNode[] => [n, ...(n.children ?? []).flatMap(flat)]

describe('weft device', () => {
  it('snapshot is the semantic tree: labels, text, state, on-screen frames', async () => {
    const host = await open('ios')
    const s = (await host.dev({ cmd: 'snapshot' })) as unknown as Snapshot
    expect(s.viewport).toEqual({ w: 402, h: 778 })
    const nodes = flat(s.root)
    expect(nodes.find((n) => n.label === 'Category')).toMatchObject({
      type: 'Choice',
      selected: 0,
      options: ['all', 'fruit', 'bakery', 'dairy'],
    })
    expect(nodes.find((n) => n.label === 'Cart tab')).toMatchObject({
      type: 'Button',
      text: 'Cart (0)',
      tone: 'tab',
      visible: true,
    })
    expect(nodes.find((n) => n.label === 'Add Apple 1')).toMatchObject({ disabled: true }) // out of stock
    expect(nodes.filter((n) => n.label?.startsWith('Add ') && !n.visible).length).toBeGreaterThan(
      100,
    ) // below the fold
    const text = render(s)
    expect(text).toContain('Button #')
    expect(text).toMatch(/… \d+ offscreen/)
  })

  it('actions reply after the app has answered, so the next snapshot sees the result', async () => {
    const host = await open('ios')
    expect(await host.dev({ cmd: 'select', label: 'Category', index: 2 })).toMatchObject({
      ok: true,
    })
    expect(await host.dev({ cmd: 'tap', label: 'Add Bagel 10' })).toMatchObject({
      ok: true,
      visible: true,
    })
    expect(await host.dev({ cmd: 'tap', label: 'Cart tab' })).toMatchObject({ ok: true })
    const s = (await host.dev({ cmd: 'snapshot' })) as unknown as Snapshot
    expect(flat(s.root).find((n) => n.label === 'total')?.text).toBe('Total $0.45')
  })

  it('errors say exactly what is wrong, so an agent can fix its next request', async () => {
    const host = await open('android', 411, 840)
    expect(await host.dev({ cmd: 'tap', label: 'Nope' })).toEqual({
      ok: false,
      error: 'no node labelled "Nope"',
    })
    expect(await host.dev({ cmd: 'tap', label: 'Add Apple 1' })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/is disabled$/),
    })
    expect(await host.dev({ cmd: 'type', label: 'Cart tab', text: 'x' })).toEqual({
      ok: false,
      error: "can't type a Button",
    })
    expect(await host.dev({ cmd: 'select', label: 'Category', index: 1 })).toEqual({
      ok: false,
      error: "can't select a Row",
    }) // chips: the CLI taps instead
    expect(await host.dev({ cmd: 'type', label: 'Search', text: 'bag' })).toMatchObject({
      ok: true,
    })
    const s = (await host.dev({ cmd: 'snapshot' })) as unknown as Snapshot
    expect(flat(s.root).find((n) => n.label === 'product-count')?.text).toBe('15 products')
  })
})
