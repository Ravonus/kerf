// cubic-bezier as a curve: pinned against values from a 60-step bisection on the parameter, an independent solver.
import { bezier } from '../src/physics'

// [x1, y1, x2, y2] and y at t = 0.1, 0.25, 0.5, 0.75, 0.9.
const known: [string, [number, number, number, number], number[]][] = [
  ['ease', [0.25, 0.1, 0.25, 1], [0.094796, 0.408511, 0.802403, 0.960459, 0.994316]],
  ['ease-in', [0.42, 0, 1, 1], [0.017027, 0.093465, 0.315357, 0.621862, 0.839428]],
  ['ease-out', [0, 0, 0.58, 1], [0.160572, 0.378138, 0.684643, 0.906535, 0.982973]],
  ['ease-in-out', [0.42, 0, 0.58, 1], [0.019722, 0.129162, 0.5, 0.870838, 0.980278]],
  ['symmetric', [0.5, 0, 0.5, 1], [0.014622, 0.105893, 0.5, 0.894107, 0.985378]],
  ['soft out', [0.215, 0.61, 0.355, 1], [0.275687, 0.6003, 0.875094, 0.976024, 0.996627]],
  ['overshoot', [0.34, 1.56, 0.64, 1], [0.403933, 0.816289, 1.087401, 1.059647, 1.012616]],
  ['flat at both ends', [1, 0, 0, 1], [0.003762, 0.029725, 0.499997, 0.970275, 0.996238]],
]

describe('bezier', () => {
  test.each(known)('%s', (_name, handles, ys) => {
    const curve = bezier(...handles)
    for (const [i, t] of [0.1, 0.25, 0.5, 0.75, 0.9].entries())
      expect(curve(t)).toBeCloseTo(ys[i]!, 5)
  })
  test('passes through the ends, and straight handles are linear', () => {
    const curve = bezier(0.3, 0.9, 0.7, 0.1)
    expect(curve(0)).toBe(0)
    expect(curve(1)).toBe(1)
    const line = bezier(0, 0, 1, 1)
    for (const t of [0.2, 0.5, 0.8]) expect(line(t)).toBeCloseTo(t, 6)
  })
})
