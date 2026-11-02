// The engine's maths, and the surface's promises: no frame scheduled with nothing to do, no work while hidden.
import { surface } from '../src/canvas'
import { FIELDS, diffuse, forces, gradientTones, levels, pack, palette, quantize, rampInks, sample, stepFor, tier, tile, type Pattern } from '../src/dither'

test('Bayer tiles are the standard matrices, and every threshold is used once', () => {
  const n8 = tile('bayer8')
  expect(Array.from(n8.t.slice(0, 4), v => Math.round(v * 64 - 0.5))).toEqual([0, 32, 8, 40])
  for (const p of ['bayer2', 'bayer4', 'bayer8', 'blue', 'halftone'] as Pattern[]) {
    const { n, t } = tile(p)
    expect(n & (n - 1), p).toBe(0)
    expect(new Set(t).size, p).toBe(n * n)
    expect(Math.min(...t)).toBeGreaterThan(0)
    expect(Math.max(...t)).toBeLessThan(1)
  }
})

// Spectral test without an FFT: difference from each neighbour is high for blue noise and flat for white.
const roughness = (t: Float32Array, n: number) => { let s = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) s += Math.abs(t[y * n + x]! - t[y * n + (x + 1) % n]!); return s / (n * n) }

test('blue noise is high-pass: neighbours differ more than random, and low thresholds never clump', () => {
  const { n, t } = tile('blue')
  expect(roughness(t, n)).toBeGreaterThan(0.38)
  const on: [number, number][] = []
  t.forEach((v, i) => { if (v < 0.1) on.push([i % n, (i / n) | 0]) })
  let tight = Infinity
  for (const [ax, ay] of on) for (const [bx, by] of on) if (ax !== bx || ay !== by) {
    const dx = Math.min(Math.abs(ax - bx), n - Math.abs(ax - bx)), dy = Math.min(Math.abs(ay - by), n - Math.abs(ay - by))
    tight = Math.min(tight, Math.hypot(dx, dy))
  }
  expect(tight).toBeGreaterThanOrEqual(2)
})

test('a flat tone keeps its coverage through every tile', () => {
  const size = 64, v = new Float32Array(size * size).fill(0.25), ink = Uint32Array.of(1, 2), out = new Uint32Array(size * size)
  for (const p of ['bayer2', 'bayer4', 'bayer8', 'blue', 'halftone'] as Pattern[]) {
    quantize(v, size, size, tile(p), ink, out)
    expect(out.filter(i => i === 2).length / out.length, p).toBeCloseTo(0.25, 1)
  }
})

test('quantize reports what changed, and nothing the second time', () => {
  const v = new Float32Array(16).fill(0.6), out = new Uint32Array(16)
  expect(quantize(v, 4, 4, tile('bayer4'), Uint32Array.of(1, 2, 3), out)).toBe(16)
  expect(quantize(v, 4, 4, tile('bayer4'), Uint32Array.of(1, 2, 3), out)).toBe(0)
})

test('error diffusion conserves tone (Floyd-Steinberg) and Atkinson stays cleaner at the ends', () => {
  const v = new Float32Array(10000).fill(0.3)
  expect(diffuse(v, 100, 100, 2).reduce((a, b) => a + b, 0) / 10000).toBeCloseTo(0.3, 1)
  const dark = new Float32Array(10000).fill(0.04)
  expect(diffuse(dark, 100, 100, 2, 'atkinson').reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(diffuse(dark, 100, 100, 2, 'floyd').reduce((a, b) => a + b, 0))
  expect(v[0]).toBe(0.30000001192092896) // the input is left alone
})

test('levels stretches a dull range; gradients run end to end', () => {
  const v = Float32Array.from({ length: 1000 }, (_, i) => 0.4 + (i / 1000) * 0.2)
  levels(v)
  expect(v[1]).toBeLessThan(0.02)
  expect(v[998]).toBeGreaterThan(0.98)
  const g = gradientTones({ angle: 0 }, 100, 10)
  expect(g[0]).toBeLessThan(0.02)
  expect(g[99]).toBeGreaterThan(0.98)
})

test('fields stay in 0–1 and are pure', () => {
  for (const [name, f] of Object.entries(FIELDS)) {
    for (let i = 0; i < 400; i++) {
      const x = (i * 0.137) % 2, y = (i * 0.211) % 1, t = i * 1.3, v = f(x, y, t)
      expect(v, name).toBeGreaterThanOrEqual(-0.001)
      expect(v, name).toBeLessThanOrEqual(1.001)
      expect(f(x, y, t)).toBe(v)
    }
  }
})

test('the lattice is the field to within a tone step, at a sixteenth of the calls', () => {
  let calls = 0
  const f = (x: number, y: number, t: number) => { calls++; return FIELDS.weave(x, y, t) }
  const a = sample(f, 160, 90, 3, new Float32Array(14400)), full = calls
  calls = 0
  const b = sample(f, 160, 90, 3, new Float32Array(14400), 4)
  expect(calls).toBeLessThan(full / 12)
  let worst = 0
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!))
  expect(worst).toBeLessThan(0.04)
  expect(stepFor(4000)).toBe(1)
  expect(stepFor(130000)).toBe(4)
})

test('a press travels and settles; an untouched lattice reports nothing', () => {
  const f = forces(['shockwave'], 100, 60)
  expect(f.step(0.016)).toBe(false)
  f.press(50, 30)
  const energyAt = (x: number) => { f.at(x, 30); return f.energy }
  f.step(0.1)
  const near = energyAt(56), far0 = energyAt(80)
  for (let i = 0; i < 12; i++) f.step(0.05)
  expect(near).toBeGreaterThan(0)
  expect(energyAt(80)).toBeGreaterThan(far0)
  let n = 0
  while (f.step(0.05) && n++ < 400);
  expect(n).toBeLessThan(400)
  expect(energyAt(50)).toBe(0)
})

test('pull drags the cloth with the pointer and it springs back', () => {
  const f = forces(['pull'], 100, 60)
  for (let i = 0; i < 12; i++) { f.move(30 + i * 2, 30); f.step(0.025) }
  f.at(50, 30)
  expect(Math.abs(f.ox)).toBeGreaterThan(0.2)
  f.leave()
  let n = 0
  while (f.step(0.05) && n++ < 800);
  f.at(50, 30)
  expect(f.ox).toBe(0)
})

test('ramps start at the page and carry a tier in length; custom inks pass through', () => {
  expect(rampInks('accent', 2)).toEqual(['none', '--warp-color-accent-soft', '--warp-color-accent-border'])
  expect(rampInks('accent', 9)).toHaveLength(5)
  expect(rampInks(['#000', 'red'], 2)).toEqual(['#000', 'red'])
  expect(pack('rgb(1, 2, 3)')).toBe(0xff030201)
  expect(pack('rgba(1, 2, 3, 0)')).toBe(0x00030201)
})

test('inks and tier numbers are read at the element, through the cascade', () => {
  document.head.innerHTML = '<style>:root{--warp-x:.5}.q{--warp-x:0}.o{--warp-x:1;--warp-dither-inks:9}</style>'
  const el = document.createElement('div')
  el.className = 'q'
  document.body.append(el)
  expect(tier(el)).toEqual({ inks: 2, speed: 0, reach: 0, gain: 0.55 })
  el.className = 'o'
  expect(tier(el).inks).toBe(9) // an override wins
  expect(tier(el).speed).toBe(1)
  el.style.color = 'rgb(9, 8, 7)'
  expect(palette(el, ['none', 'rgb(9, 8, 7)'])).toEqual(Uint32Array.of(0, 0xff070809))
  expect(el.children).toHaveLength(0) // the probe is gone
  el.remove()
})

describe('surface', () => {
  let frames: FrameRequestCallback[], box: HTMLDivElement, canvas: HTMLCanvasElement, draws: number
  const fake = { setTransform: vi.fn() }
  const tick = (now = 16) => { const q = frames; frames = []; for (const f of q) f(now) }
  beforeEach(() => {
    frames = []
    draws = 0
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f))
    box = document.createElement('div')
    Object.defineProperty(box, 'clientWidth', { value: 300 })
    Object.defineProperty(box, 'clientHeight', { value: 150 })
    canvas = document.createElement('canvas')
    canvas.getContext = (() => fake) as any
    box.append(canvas)
    document.body.append(box)
  })
  afterEach(() => { tick(); box.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  test('a still surface paints once and schedules nothing more', () => {
    const s = surface(canvas, { draw: () => void draws++ })
    expect(frames).toHaveLength(1)
    tick()
    expect(draws).toBe(1)
    expect(frames).toHaveLength(0)
    s.invalidate()
    s.invalidate()
    expect(frames).toHaveLength(1)
    tick()
    expect(draws).toBe(2)
    s.destroy()
  })

  test('animation runs on one shared frame, and a draw can keep itself alive and settle', () => {
    const a = surface(canvas, { draw: () => void draws++, animate: true })
    let left = 2
    const c2 = document.createElement('canvas')
    c2.getContext = (() => fake) as any
    box.append(c2)
    const b = surface(c2, { draw: () => { draws++; return --left > 0 } })
    expect(frames).toHaveLength(1)
    tick(16); tick(32); tick(48)
    expect(draws).toBe(5)
    a.destroy()
    tick(64)
    expect(draws).toBe(5)
    expect(frames).toHaveLength(0)
    b.destroy()
  })

  test('reduced motion gives one frame of an animated surface', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const s = surface(canvas, { draw: () => void draws++, animate: true })
    tick(16); tick(32)
    expect(draws).toBe(1)
    s.destroy()
  })

  test('a hidden tab stops the loop, and coming back resumes without a jump in time', () => {
    const times: number[] = []
    const s = surface(canvas, { draw: f => void times.push(f.time), animate: true })
    tick(1000); tick(1016)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    tick(1032)
    expect(frames).toHaveLength(0)
    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    tick(9000); tick(9016)
    expect(times.at(-1)! - times[1]!).toBeLessThan(0.05)
    s.destroy()
  })

  test('cell mode snaps to device pixels and backs one pixel per cell', () => {
    vi.stubGlobal('devicePixelRatio', 1.5)
    const seen: number[] = []
    const s = surface(canvas, { draw: f => void seen.push(f.width, f.height), cell: 7 })
    tick()
    expect(seen).toEqual([41, 21]) // 7 css px is 10.5 device px, snapped to 11 → 7.33 css px
    expect(canvas.width).toBe(41)
    expect(parseFloat(canvas.style.width)).toBeCloseTo((41 * 11) / 1.5, 3)
    s.destroy()
  })

  test('a dial change around the canvas repaints it; one elsewhere does not', async () => {
    let themed = 0
    const s = surface(canvas, { draw: () => void draws++, onTheme: () => void themed++ })
    tick()
    const other = document.createElement('div')
    document.body.append(other)
    other.setAttribute('data-theme', 'dark')
    await Promise.resolve()
    expect(themed).toBe(0)
    box.setAttribute('data-expression', 'vivid')
    await Promise.resolve()
    expect(themed).toBe(1)
    tick()
    expect(draws).toBe(2)
    other.remove()
    s.destroy()
  })
})
