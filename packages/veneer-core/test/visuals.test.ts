import { analyzeArtworkCorners, particleSamples, scratchMask, visualRandom } from '../src/visuals'

type Pixels = readonly [number, number, number, number]

function sample(pixel: (x: number, y: number) => Pixels) {
  const width = 96
  const data = new Uint8ClampedArray(width * width * 4)
  for (let i = 0; i < width * width; i++) data.set(pixel(i % width, Math.floor(i / width)), i * 4)
  return analyzeArtworkCorners({ data, width, height: width })
}

test('solid artwork keeps its geometry', () => {
  expect(sample(() => [80, 122, 140, 255])).toMatchObject({
    reason: 'solid-corners',
    shouldClip: false,
    scale: 1,
    repairColor: null,
  })
})

test('a transparent corner can be filled from a stable interior color', () => {
  const scan = sample((x, y) => {
    const u = Math.min(x, 95 - x),
      v = Math.min(y, 95 - y)
    return [80, 122, 140, u + v < 10 ? 0 : 255]
  })
  expect(scan).toMatchObject({ reason: 'transparent-corners', shouldClip: true })
  expect(scan.scale).toBeGreaterThan(1)
  expect(scan.repairColor).toContain('80, 122, 140')
})

test('an opaque edge frame has a crop while a truncated buffer stays untouched', () => {
  const scan = sample((x, y) =>
    Math.min(x, y, 95 - x, 95 - y) < 8 ? [230, 230, 230, 255] : [40, 55, 80, 255],
  )
  expect(scan).toMatchObject({ reason: 'edge-frame', shouldClip: true })
  expect(
    analyzeArtworkCorners({ width: 96, height: 96, data: new Uint8ClampedArray(4) }).shouldClip,
  ).toBe(false)
})

test('seeded particle samples are repeatable and the particle budget is bounded', () => {
  const first = particleSamples('embers', 20)
  expect(particleSamples('embers', 20)).toEqual(first)
  expect(particleSamples('cloud', 20)).not.toEqual(first)
  expect(particleSamples('embers', 2048)).toHaveLength(512)
  expect(particleSamples('embers', Number.NaN)).toEqual([])
  expect(visualRandom('x')()).toBeGreaterThanOrEqual(0)
})

test('scratching a new strip increases coverage but retracing it does not', () => {
  const mask = scratchMask()
  const from = { x: 0.1, y: 0.2 },
    to = { x: 0.9, y: 0.2 }
  const first = mask.stroke(from, to)
  const repeat = mask.stroke(from, to)
  const next = mask.stroke({ ...from, y: 0.8 }, { ...to, y: 0.8 })
  expect(first).toBeGreaterThan(0)
  expect(repeat).toBe(first)
  expect(next).toBeGreaterThan(first)
})
