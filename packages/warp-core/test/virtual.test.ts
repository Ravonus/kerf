// @vitest-environment jsdom
import { Sizes, slices, virtualizer, type VirtualOptions } from '../src/virtual'

const brute = (s: number[], y: number) => {
  let at = 0
  for (let i = 0; i < s.length; i++) { if (at + s[i]! > y) return i; at += s[i]! }
  return s.length - 1
}

test('Sizes agrees with a linear scan through sets, pushes and fills', () => {
  let seed = 7
  const rand = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n
  const plain = Array.from({ length: 500 }, () => 10 + rand(90))
  const s = new Sizes(plain)
  for (let step = 0; step < 2000; step++) {
    if (step % 3 === 0) { plain.push(10 + rand(90)); s.push(plain.at(-1)!) }
    else { const i = rand(plain.length); plain[i] = 10 + rand(90); s.set(i, plain[i]) }
    const i = rand(plain.length)
    expect(s.offset(i)).toBe(plain.slice(0, i).reduce((a, b) => a + b, 0))
    const y = rand(s.total)
    expect(s.at(y)).toBe(brute(plain, y))
  }
  expect(s.total).toBe(plain.reduce((a, b) => a + b, 0))
  expect(s.at(s.total + 50)).toBe(plain.length - 1)
  expect(s.at(-5)).toBe(0)
})

function host(viewport = 400, width = 300) {
  const el = document.createElement('div'), spacer = document.createElement('div')
  el.append(spacer)
  document.body.append(el)
  Object.defineProperty(el, 'clientHeight', { get: () => viewport })
  Object.defineProperty(el, 'clientWidth', { get: () => width })
  spacer.getBoundingClientRect = () => ({ width }) as DOMRect
  let top = 0
  Object.defineProperty(el, 'scrollTop', { get: () => top, set: v => { top = Math.max(0, v) } })
  return { el, spacer, top: () => top, scroll: (y: number) => { top = y; el.dispatchEvent(new Event('scroll')) } }
}

type Obs = { fn: ResizeObserverCallback; seen: Set<Element> }
const observers: Obs[] = []
beforeEach(() => {
  observers.length = 0
  vi.stubGlobal('ResizeObserver', class {
    o: Obs
    constructor(fn: ResizeObserverCallback) { this.o = { fn, seen: new Set() }; observers.push(this.o) }
    observe(e: Element) { this.o.seen.add(e) }
    unobserve(e: Element) { this.o.seen.delete(e) }
    disconnect() { this.o.seen.clear() }
  })
})
/** The browser reporting a row's real size. */
const report = (row: Element, blockSize: number) => {
  for (const o of observers) if (o.seen.has(row)) o.fn([{ target: row, borderBoxSize: [{ blockSize, inlineSize: 300 }] } as unknown as ResizeObserverEntry], null as unknown as ResizeObserver)
}

function list(n: number, over: Partial<VirtualOptions> = {}) {
  const h = host()
  const seen: number[][] = []
  const v = virtualizer(h.el, { keys: Array.from({ length: n }, (_, i) => i), spacer: h.spacer, estimate: 50, overscan: 0, onRange: r => seen.push(r), ...over })
  return { ...h, v, seen, range: () => seen.at(-1)! }
}

test('10,000 rows: only the window renders, and the spacer holds the whole height', () => {
  const l = list(10000)
  expect(l.range()).toEqual(Array.from({ length: 9 }, (_, i) => i))
  expect(l.spacer.style.blockSize).toBe('500000px')
  l.scroll(250000)
  expect(l.range()[0]).toBe(5000)
  expect(l.range().length).toBe(9)
})

test('exact sizes from `size` put a row where the sum says, before anything renders', () => {
  const l = list(1000, { size: i => (i % 2 ? 20 : 40) })
  expect(l.spacer.style.blockSize).toBe('30000px')
  const row = document.createElement('div')
  l.v.attach(row, 3)
  expect(row.style.transform).toBe('translateY(100px)')
})

test('a row above the viewport changes size: what is on screen stays put', () => {
  const l = list(1000)
  l.scroll(5010)
  const above = document.createElement('div')
  l.v.attach(above, 3)
  report(above, 80) // 30 taller
  expect(l.top()).toBe(5040)
  expect(l.v.anchor()).toEqual({ index: 100, within: 10 })
})

test('a row below the viewport changes size: scrollTop stays', () => {
  const l = list(1000)
  l.scroll(100)
  const below = document.createElement('div')
  l.v.attach(below, 500)
  report(below, 80)
  expect(l.top()).toBe(100)
  expect(l.spacer.style.blockSize).toBe('50030px')
})

test('rendered sizes stay with their key: prepending keeps the anchor on screen', () => {
  const keys = Array.from({ length: 100 }, (_, i) => `m${i}`)
  const l = list(100, { keys })
  const row = document.createElement('div')
  l.v.attach(row, 'm2')
  report(row, 90)
  l.scroll(1000)
  const anchor = l.v.anchor()
  l.v.update({ keys: ['a', 'b', ...keys] })
  expect(l.v.anchor()).toEqual({ index: anchor.index + 2, within: anchor.within })
  expect(l.top()).toBe(1100)
  expect(row.style.transform).toBe('translateY(200px)')
})

test('appending writes nothing above, and sticks when the user is at the end', () => {
  const keys = Array.from({ length: 100 }, (_, i) => i)
  const stuck: boolean[] = []
  const l = list(100, { keys, stick: 48, from: 'end', onStick: s => stuck.push(s) })
  expect(l.top()).toBe(4600)
  l.v.update({ keys: [...keys, 100] })
  expect(l.top()).toBe(4650)
  l.scroll(1000)
  expect(stuck).toEqual([false])
  l.v.update({ keys: [...keys, 100, 101] })
  expect(l.top()).toBe(1000)
  l.scroll(4720)
  expect(stuck).toEqual([false, true])
})

test('a pinned row renders wherever it is, and a release lets it go', () => {
  const l = list(1000, { pinned: () => [900] })
  expect(l.range()).toContain(900)
  l.scroll(45000)
  expect(l.range()[0]).toBe(900)
  expect(l.range().filter(i => i === 900)).toHaveLength(1)
})

test('a new width asks `size` again, and rendered heights of the old width are dropped', () => {
  let width = 300
  const h = host(400, 300)
  h.spacer.getBoundingClientRect = () => ({ width }) as DOMRect
  const v = virtualizer(h.el, { keys: [0, 1, 2], spacer: h.spacer, estimate: 10, size: (_, w) => 6000 / w, overscan: 0, onRange() {} })
  const row = document.createElement('div')
  v.attach(row, 0)
  report(row, 99)
  expect(v.sizes.get(0)).toBe(99)
  width = 600
  for (const o of observers) if (o.seen.has(h.el)) o.fn([], null as unknown as ResizeObserver)
  expect(v.sizes.get(0)).toBe(10)
})

test('scrollTo lands exactly on a far row, in each alignment', () => {
  const l = list(1000, { size: i => 20 + (i % 5) * 10 })
  const at = l.v.sizes.offset(700)
  l.v.scrollTo(700)
  expect(l.top()).toBe(at)
  l.v.scrollTo(700, 'end')
  expect(l.top()).toBe(at + l.v.sizes.get(700)! - 400)
  l.v.scrollTo(700, 'center')
  expect(l.top()).toBe(at - (400 - l.v.sizes.get(700)!) / 2)
})

test('slices runs to the end across tasks, and stops when asked', async () => {
  let n = 0
  await new Promise<void>(done => { slices(() => { n++; if (n === 1000) { done(); return false } return true }, 0.01) })
  expect(n).toBe(1000)
})
