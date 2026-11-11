// Keyframe tracks and section progress: the maths a scroll-scrubbed scene reads.
import { progress, progressOf, timeline, vars } from '../src/timeline'

describe('timeline', () => {
  test('holds before the first key and after the last', () => {
    const t = timeline({
      x: [
        [0.2, 10],
        [0.8, 30],
      ],
    })
    expect(t.value('x', 0)).toBe(10)
    expect(t.value('x', 1)).toBe(30)
  })
  test('eases into a key with that key’s curve', () => {
    const t = timeline({
      lin: [
        [0, 0],
        [1, 100, 'linear'],
      ],
      soft: [
        [0, 0],
        [1, 100],
      ],
    })
    expect(t.value('lin', 0.25)).toBe(25)
    expect(t.value('soft', 0.25)).toBeCloseTo(6.25)
    expect(t.value('soft', 0.5)).toBe(50)
  })
  test('a key takes cubic-bezier handles', () => {
    const t = timeline({
      x: [
        [0, 0],
        [1, 100, [0.42, 0, 0.58, 1]],
      ],
    })
    expect(t.value('x', 0.25)).toBeCloseTo(12.9162, 3)
    expect(t.value('x', 0.5)).toBeCloseTo(50, 6)
  })
  test('sorts keys, and reads every track at once', () => {
    const t = timeline({
      a: [
        [1, 4, 'linear'],
        [0, 0],
      ],
      b: [
        [0, 1],
        [0.5, 3, (p) => p * p],
      ],
    })
    expect({ ...t.at(0.5) }).toEqual({ a: 2, b: 3 })
    expect(t.at(0.25).b).toBe(1.5)
  })
  test('a track without keys is an error', () => {
    expect(() => timeline({ x: [] })).toThrow('track `x` has no keys')
  })
})

describe('vars', () => {
  test('writes every track to the element as a custom property', () => {
    const el = document.createElement('div')
    const write = vars(
      el,
      timeline({
        scale: [
          [0, 1, 'linear'],
          [1, 3, 'linear'],
        ],
        fade: [[0, 0.5]],
      }),
    )
    write(0.5)
    expect(el.style.getPropertyValue('--scale')).toBe('2')
    expect(el.style.getPropertyValue('--fade')).toBe('0.5')
    write(1)
    expect(el.style.getPropertyValue('--scale')).toBe('3')
  })
})

describe('progressOf', () => {
  test('pin: from the top meeting the viewport top to the bottom meeting its bottom', () => {
    expect(progressOf({ top: 100, height: 3000 }, 1000)).toBe(0)
    expect(progressOf({ top: -1000, height: 3000 }, 1000)).toBe(0.5)
    expect(progressOf({ top: -2500, height: 3000 }, 1000)).toBe(1)
  })
  test('through: from entering below to leaving above', () => {
    expect(progressOf({ top: 1000, height: 500 }, 1000, 'through')).toBe(0)
    expect(progressOf({ top: 250, height: 500 }, 1000, 'through')).toBe(0.5)
    expect(progressOf({ top: -500, height: 500 }, 1000, 'through')).toBe(1)
  })
  test('a section no taller than the viewport is done once it reaches the top', () => {
    expect(progressOf({ top: 10, height: 800 }, 1000)).toBe(0)
    expect(progressOf({ top: 0, height: 800 }, 1000)).toBe(1)
  })
})

describe('progress', () => {
  test('reports where the section stands at once, and stops listening when destroyed', () => {
    const el = document.createElement('div')
    let top = -1000
    el.getBoundingClientRect = () => ({ top, height: 3000 }) as DOMRect
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true })
    const seen: number[] = []
    const p = progress(el, { damp: 1, onChange: (v) => seen.push(v) })
    expect(p.value).toBe(0.5)
    expect(seen).toEqual([0.5])
    top = -2000
    dispatchEvent(new Event('scroll'))
    expect(p.target).toBe(1)
    p.destroy()
    top = 0
    dispatchEvent(new Event('scroll'))
    expect(p.target).toBe(1)
  })
  test('measures a scene against the viewport element given, not the window', () => {
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ top: 900, height: 2000 }) as DOMRect
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true })
    const stage = document.createElement('div')
    Object.defineProperty(stage, 'clientHeight', { value: 900 })
    const p = progress(el, { range: 'scene', viewport: stage })
    expect(p.value).toBe(0)
    expect(progress(el, { range: 'scene' }).value).toBeGreaterThan(0)
  })
  test('reports how fast the target moves, and 0 once the scroll pauses', () => {
    const el = document.createElement('div')
    let top = 0
    el.getBoundingClientRect = () => ({ top, height: 3000 }) as DOMRect
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true })
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const p = progress(el, { damp: 1 })
    expect(p.velocity).toBe(0)
    top = -200
    dispatchEvent(new Event('scroll'))
    now.mockReturnValue(1016)
    top = -300
    dispatchEvent(new Event('scroll'))
    expect(p.velocity).toBeCloseTo(0.05 / 16, 8)
    now.mockReturnValue(1100)
    expect(p.velocity).toBe(0)
    p.destroy()
    now.mockRestore()
  })
  test('`touch: raw` follows the scroll exactly on a coarse pointer', async () => {
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({ matches: query === '(pointer: coarse)' }),
      configurable: true,
    })
    const el = document.createElement('div')
    let top = 0
    el.getBoundingClientRect = () => ({ top, height: 3000 }) as DOMRect
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true })
    const eased = progress(el, { damp: 0.1 })
    const raw = progress(el, { damp: 0.1, touch: 'raw' })
    top = -1000
    dispatchEvent(new Event('scroll'))
    await new Promise((ok) => {
      requestAnimationFrame(ok)
    })
    expect(raw.value).toBe(0.5)
    expect(eased.value).toBeCloseTo(0.05, 6)
    eased.destroy()
    raw.destroy()
    delete (window as { matchMedia?: unknown }).matchMedia
  })
})

describe('progressOf scene', () => {
  // Measured on a scroll-driven page at a 900 px viewport: a section's top and height, its lead in px, the
  // scroll offsets where its position is 0 and 1, and its position at the end, where its bottom meets the top.
  const measured: {
    top: number
    height: number
    lead: number
    y0: number
    y1: number
    yEnd: number
    end: number
  }[] = [
    { top: 0, height: 1350, lead: 0, y0: -900, y1: 0, yEnd: 1350, end: 2.5 },
    { top: 9906, height: 2735, lead: 0, y0: 9006, y1: 9906, yEnd: 12641, end: 4.04 },
    { top: 30778, height: 2192, lead: 180, y0: 29698, y1: 30650, yEnd: 32970, end: 3.44 },
    { top: 38235, height: 2890, lead: 180, y0: 37155, y1: 38098, yEnd: 41125, end: 4.21 },
    { top: 41125, height: 2404, lead: 180, y0: 40045, y1: 40994, yEnd: 43529, end: 3.67 },
    { top: 45748, height: 8381, lead: 180, y0: 44668, y1: 45585, yEnd: 54129, end: 10.31 },
  ]
  test.each(measured)(
    'top $top, height $height, lead $lead',
    ({ top, height, lead, y0, y1, yEnd, end }) => {
      const at = (y: number) => progressOf({ top: top - y, height }, 900, 'scene', lead / 900)
      expect(at(y0)).toBeCloseTo(0, 9)
      expect(at(y0 - 500)).toBe(0)
      expect(at(y1)).toBeCloseTo(1, 2)
      expect(at(yEnd)).toBeCloseTo(end, 2)
      expect(at(yEnd + 900)).toBeCloseTo(end, 2)
    },
  )
  test('positions are viewports: keys at 0.4 and 2.1 sit 952 px per unit apart with a 0.2 lead', () => {
    const at = (y: number) => progressOf({ top: 30778 - y, height: 2192 }, 900, 'scene', 0.2)
    expect(at(30079)).toBeCloseTo(0.4, 2)
    expect(at(31698)).toBeCloseTo(2.1, 2)
  })
})
