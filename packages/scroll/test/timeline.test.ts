// Keyframe tracks and section progress: the maths a scroll-scrubbed scene reads.
import { progress, progressOf, timeline } from '../src/timeline'

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
})
