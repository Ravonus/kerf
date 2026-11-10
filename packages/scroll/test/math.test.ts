// The pure parts: thumb geometry, snapping, wheel normalising and the physics behind the feel.
import { dragRatio, progressAt, thumbLength, thumbOffset } from '../src/bar'
import { coast, coastDistance, easings, rubber, spring, unrubber, Velocity } from '../src/physics'
import { snapStep, snapTo } from '../src/snap'
import { normalizeWheel, pageStep } from '../src/wheel'

describe('thumb', () => {
  test('is proportional to the share of content in view', () => {
    expect(thumbLength(200, 100, 400)).toBe(50)
  })
  test('keeps to its min and max', () => {
    expect(thumbLength(200, 100, 100_000)).toBe(24)
    expect(thumbLength(200, 100, 100_000, { min: 40 })).toBe(40)
    expect(thumbLength(200, 100, 200, { max: 60 })).toBe(60)
  })
  test('with a fixed size never grows or shrinks', () => {
    for (const total of [150, 400, 10_000, 1e7])
      expect(thumbLength(200, 100, total, { size: 32 })).toBe(32)
    expect(thumbLength(20, 100, 400, { size: 32 })).toBe(20)
  })
  test('moves across the room left by its length', () => {
    expect(thumbOffset(200, 50, 0)).toBe(0)
    expect(thumbOffset(200, 50, 1)).toBe(150)
    expect(thumbOffset(200, 50, 2)).toBe(150)
  })
  test('a drag maps thumb px to scroll px, and a jump centres the thumb', () => {
    expect(dragRatio(200, 50, 300)).toBe(2)
    expect(dragRatio(50, 50, 300)).toBe(0)
    expect(progressAt(200, 50, 25)).toBe(0)
    expect(progressAt(200, 50, 100)).toBeCloseTo(0.5)
  })
})

describe('snap', () => {
  const points = [0, 100, 200, 300]
  test('proximity rests on a near point and leaves a far one', () => {
    expect(snapTo(points, 130, { proximity: 40 })).toBe(100)
    expect(snapTo(points, 150, { proximity: 40 })).toBe(150)
  })
  test('mandatory always rests on a point, kept inside the range', () => {
    expect(snapTo(points, 150, { type: 'mandatory' })).toBe(100)
    expect(snapTo([0, 500], 480, { type: 'mandatory', max: 400 })).toBe(400)
  })
  test('a step goes to the next point each way', () => {
    expect(snapStep(points, 100, 1, 300)).toBe(200)
    expect(snapStep(points, 100, -1, 300)).toBe(0)
    expect(snapStep(points, 300, 1, 300)).toBe(300)
  })
})

describe('wheel', () => {
  const page = { x: 400, y: 800 }
  test('lines and pages become pixels and animate', () => {
    expect(
      normalizeWheel({ deltaX: 0, deltaY: 3, deltaMode: 1, shiftKey: false }, 40, page),
    ).toEqual({
      x: 0,
      y: 120,
      notched: true,
    })
    expect(
      normalizeWheel({ deltaX: 0, deltaY: -1, deltaMode: 2, shiftKey: false }, 40, page).y,
    ).toBe(-800)
  })
  test("a wheel's 120-unit notch animates; a trackpad's pixels apply as they come", () => {
    const mouse = { deltaX: 0, deltaY: 100, deltaMode: 0, shiftKey: false, wheelDeltaY: -120 }
    expect(normalizeWheel(mouse, 40, page).notched).toBe(true)
    const pad = { deltaX: 0, deltaY: 3.5, deltaMode: 0, shiftKey: false, wheelDeltaY: -10 }
    expect(normalizeWheel(pad, 40, page).notched).toBe(false)
  })
  test('shift turns a vertical wheel horizontal', () => {
    expect(
      normalizeWheel({ deltaX: 0, deltaY: 50, deltaMode: 0, shiftKey: true }, 40, page),
    ).toMatchObject({
      x: 50,
      y: 0,
    })
  })
  test('a page keeps some of the last screen', () => {
    expect(pageStep(800)).toBe(760)
    expect(pageStep(100)).toBe(87.5)
  })
})

describe('physics', () => {
  test('a coast ends where its closed form says, however it is stepped', () => {
    let v = 2
    let at = 0
    for (let i = 0; i < 2000 && Math.abs(v) > 1e-6; i++) {
      const s = coast(v, 0.998, 16)
      at += s.moved
      v = s.v
    }
    expect(at).toBeCloseTo(coastDistance(2, 0.998), 3)
  })
  test('the rubber band gives less the further it is pulled, and never a whole viewport', () => {
    const size = 500
    expect(rubber(0, size)).toBe(0)
    expect(rubber(100, size)).toBeLessThan(100)
    expect(rubber(10_000, size)).toBeLessThan(size)
    expect(rubber(-100, size)).toBe(-rubber(100, size))
    expect(unrubber(rubber(137, size), size)).toBeCloseTo(137, 6)
  })
  test('the spring settles at rest without overshooting the edge', () => {
    expect(Math.abs(spring(80, 0, 800))).toBeLessThan(1)
    for (let t = 0; t < 1000; t += 10) expect(spring(80, 0, t)).toBeGreaterThanOrEqual(0)
  })
  test('easings run 0 to 1', () => {
    for (const ease of Object.values(easings)) {
      expect(ease(0)).toBeCloseTo(0)
      expect(ease(1)).toBeCloseTo(1)
    }
  })
  test('velocity reads the last moves, and a pause before lifting stops the fling', () => {
    const v = new Velocity()
    for (let t = 0; t <= 80; t += 16) v.add(t, 0, t * 2)
    expect(v.get(80).y).toBeCloseTo(2)
    expect(v.get(200).y).toBe(0)
  })
})
