// Shape variants and placeholders (research 31): <Boundary pending="shape"> renders the compiled variant of its
// children from a resource's shape, in warp's SkeletonScope markup, and none of the component's behaviour runs.
// weft-allow T004, T005: fake timers drive the Boundary's timing; the skeleton's structure is the behaviour under test
import { fakeMeasure, flush, render } from 'weft/test'
import { fill, mask, placeholder, shapeAny, shapeText } from 'weft/shape'
import { streamBlocks, Text } from 'weft/text'
import { Page } from './fixtures/shape/Page'
import type { Post } from './fixtures/shape/Feed'

const shape: Post[] = [
  { id: 1, title: 'Xnnnn nnnnn', body: 'nnnnn nnnnn nnnnn', pic: 'x' },
  { id: 2, title: 'Xnnnn', body: 'nnn', pic: undefined },
]

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

test('pending="shape": the same markup, with its text in skeleton spans, busy and inert', async () => {
  render(Page, { shape })
  await vi.advanceTimersByTimeAsync(150)
  const scope = document.querySelector('[data-scope="skeleton-scope"][role="status"]')!
  expect(scope.getAttribute('aria-busy')).toBe('true')
  expect(scope.hasAttribute('inert')).toBe(true)
  expect((scope as HTMLElement).style.display).toBe('contents')
  const rows = [...scope.querySelectorAll('ul > li.row')]
  expect(rows).toHaveLength(2)
  expect(rows[0].querySelector('h3 [data-skeleton]')!.textContent).toBe('Xnnnn nnnnn')
  expect(rows[0].querySelector('p [data-skeleton]')!.textContent).toBe('nnnnn nnnnn nnnnn')
  expect(rows[0].querySelector('img')!.getAttribute('width')).toBe('40')
  expect(rows[0].querySelector('img')!.hasAttribute('src')).toBe(false)
  expect(rows[1].querySelector('img')).toBeNull()
  // The typical branch, from the placeholder data, and the variant's static text.
  expect(scope.querySelector('.more')).not.toBeNull()
  expect(scope.querySelector('.empty')).toBeNull()
  // No ids, links or handlers.
  expect(scope.querySelector('#title')).toBeNull()
  expect(scope.querySelector('a')!.hasAttribute('href')).toBe(false)
  // <Text> keeps its element in a variant.
  expect(scope.querySelector('h3.sum')).not.toBeNull()
})

test('the content swaps in whole, and the component ran once', async () => {
  const effects: string[] = []
  render(Page, { shape, effects })
  await vi.advanceTimersByTimeAsync(150)
  expect(document.querySelector('[data-skeleton]')).not.toBeNull()
  await vi.advanceTimersByTimeAsync(400)
  await flush()
  expect(document.querySelector('[data-skeleton]')).toBeNull()
  expect(document.querySelector('.row h3')!.textContent).toBe('One')
  expect(effects).toEqual(['setup'])
})

test('a shape-less resource still gets a skeleton', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  render(Page, {})
  await vi.advanceTimersByTimeAsync(150)
  expect(document.querySelectorAll('.row').length).toBe(3)
  expect(warn.mock.calls.flat().join('\n')).toMatch(/X032/)
})

test('fill: a tree to placeholders, with counts from limit, then .max(), then 5 and X032', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(fill({ a: { $s: 8 }, b: 3, c: null })).toEqual({ a: 'nnnnn nn', b: 3, c: null })
  expect(fill({ $a: 2, $of: { x: 1 } })).toHaveLength(2)
  expect(fill({ $a: 2, $of: 0 }, 4)).toHaveLength(4)
  expect(fill({ $a: 900, $of: 0 })).toHaveLength(50)
  expect(warn).not.toHaveBeenCalled()
  expect(fill({ items: { $of: 0 } }).items).toHaveLength(5)
  expect(warn.mock.calls[0][0]).toMatch(/X032 a skeleton repeats `items`/)
})

test('X036 fires when a hintless string is shown, not when it is only filled', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const v = fill({ note: { $u: 17 }, other: { $s: 3 } })
  expect(warn).not.toHaveBeenCalled()
  shapeText(() => v.other)
  expect(warn).not.toHaveBeenCalled()
  shapeText(() => v.note)
  expect(warn.mock.calls[0][0]).toMatch(/X036 a skeleton shows `note`/)
})

test('mask: same widths and word breaks, none of the text', () => {
  expect(mask('Hello, Wim 42')).toBe('Xniini mim 00')
  expect(mask({ a: 'ok', n: 7, t: true, z: null, l: ['hi'] })).toEqual({ a: 'nn', n: 7, t: true, z: null, l: ['ni'] })
  expect(mask(['a', 'b', 'c'], 2)).toHaveLength(2)
  expect(mask(Array(80).fill(1))).toHaveLength(50)
})

test('shapeAny reads as anything; shapeText survives what throws', () => {
  expect(String(shapeAny.a.b())).toBe('nnnnn nnnnn')
  expect(shapeAny.length).toBe(3)
  expect(shapeText()).toBe('nnnnn nnnnn')
  expect(shapeText(() => { throw new Error('x') })).toBe('nnnnn nnnnn')
  expect(shapeText(() => null)).toBe('')
  expect(placeholder(13)).toBe('nnnnn nnnnn n')
})

test('<Text reserve>: a placeholder in the real element, then one swap', async () => {
  vi.useRealTimers()
  const { state } = await import('weft')
  const text = state<string | undefined>(undefined)
  render(() => <Text as="h2" class="t" reserve={11}>{text.value}</Text>)
  await flush()
  const el = document.querySelector('h2.t')!
  expect(el.getAttribute('data-scope')).toBe('skeleton-scope')
  expect(el.getAttribute('aria-busy')).toBe('true')
  expect(el.querySelector('[data-skeleton]')!.textContent).toBe('nnnnn nnnnn')
  text.value = 'Hello'
  await flush()
  expect(el.textContent).toBe('Hello')
  expect(el.hasAttribute('aria-busy')).toBe(false)
  expect(document.querySelector('h2.t')).toBe(el)
})

test('<Text stream>: the height only grows', async () => {
  vi.useRealTimers()
  const { state } = await import('weft')
  const text = state('Hello')
  let height = 40
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect)
  render(() => <Text stream>{text.value}</Text>)
  const frame = () => new Promise(requestAnimationFrame)
  await flush()
  await frame()
  const el = document.querySelector<HTMLElement>('[data-block]')!.parentElement!
  expect(el.style.minBlockSize).toBe('40px')
  height = 20
  text.value = 'Hi'
  await flush()
  await frame()
  expect(el.style.minBlockSize).toBe('40px')
})

test('<Text stream>: tokens land once a frame, in whole lines, and complete blocks are never rewritten', async () => {
  vi.useRealTimers()
  const { state } = await import('weft')
  const text = state('# One')
  let height = 25
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height, width: 300 }) as DOMRect)
  const { container } = render(() => <Text stream style="line-height:20px">{text.value}</Text>)
  const frame = () => new Promise(requestAnimationFrame)
  await flush()
  await frame()
  const el = container.firstElementChild as HTMLElement
  expect(el.style.minBlockSize).toBe('40px')
  text.value = '# One\n\nTw'
  text.value = '# One\n\nTwo'
  await flush()
  expect(el.textContent).toBe('# One')
  await frame()
  expect(el.textContent).toBe('# OneTwo')
  const done = el.querySelector('[data-block="done"]')!
  text.value = '# One\n\nTwo\n\nThree'
  await flush()
  await frame()
  expect(el.querySelector('[data-block="done"]')).toBe(done)
  expect(el.querySelectorAll('[data-block="done"]')).toHaveLength(2)
  expect(el.querySelector('[data-block="tail"]')!.textContent).toBe('Three')
  height = 50
  vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(() => ({ height, width: 200 }) as DOMRect)
  text.value += '!'
  await flush()
  await frame()
  expect(el.style.minBlockSize).toBe('60px')
})

test('streamBlocks: a blank line inside a code fence does not end a block', () => {
  expect(streamBlocks('a\n\n```\nb\n\nc')).toEqual({ done: ['a'], tail: '```\nb\n\nc' })
  expect(streamBlocks('```\nb\n\nc\n```\n\nd')).toEqual({ done: ['```\nb\n\nc\n```'], tail: 'd' })
})

test('measure, lines and fit: exact boxes from the slot, null with none bound', async () => {
  const { measure, lines, fit } = await import('weft/text')
  const spec = { font: '16px Inter', lineHeight: 20, width: 80 }
  let box: any, rows: any, size: any
  function Probe() {
    box = measure('one two three four', spec)
    rows = lines('one two three four', spec)
    size = fit('one two', { font: s => `${s}px Inter`, width: 400 })
    return null
  }
  render(Probe, {}, { slots: { 'text.measure': fakeMeasure() } })
  await flush()
  await flush()
  expect(box.value).toEqual({ height: 40, lineCount: 2 })
  expect(rows.value.map((l: any) => l.text)).toEqual(['one two', 'three four'])
  expect(size.value).toBe(200) // the fake's width doesn't depend on size
})
