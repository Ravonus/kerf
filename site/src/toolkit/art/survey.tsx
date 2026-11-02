import { DitherField } from '@weft-js/warp'
import { clamp, fbm, smooth, type ArtProps, type Meta } from './shared'
import code from './survey.tsx?raw'

export const meta: Meta = { name: 'Survey', description: 'A contour map of country that doesn\'t exist. Bring the pointer close and a new hill comes up under it.', kind: 'field', code }

const W = 96, H = 60, RINGS = 15

export default function Survey({ live = true }: ArtProps) {
  const hills = new Float32Array(W * H)
  let stamp = NaN, px = -1, py = -1, lift = 0, aspect = 1.6
  function survey(t: number) {
    stamp = t
    lift = px < 0 ? Math.max(0, lift - 0.015) : Math.min(1, lift + 0.03)
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      const u = (x / (W - 1)) * aspect * 1.5, v = (y / (H - 1)) * 1.5
      let h = fbm(u + t * 0.008, v - t * 0.005, 4)
      h = (h - 0.28) * 1.75
      if (lift) { const dx = x / (W - 1) - px, dy = y / (H - 1) - py; h += 0.32 * lift * Math.exp(-(dx * dx * 2.5 + dy * dy) * 18) }
      hills[i] = h
    }
  }
  const map = (x: number, y: number, t: number) => {
    if (x > aspect) aspect = x
    if (t !== stamp) survey(t)
    const fx = clamp(x / aspect) * (W - 1.001), fy = y * (H - 1.001), ix = fx | 0, iy = fy | 0, kx = fx - ix, ky = fy - iy, i = iy * W + ix
    const h = (hills[i] * (1 - kx) + hills[i + 1] * kx) * (1 - ky) + (hills[i + W] * (1 - kx) + hills[i + W + 1] * kx) * ky
    // distance to the nearest contour, divided by the slope, so a line keeps its weight on steep ground and on flat
    const sx = Math.abs(hills[i + 1]! - hills[i]!) * (W - 1), sy = Math.abs(hills[i + W]! - hills[i]!) * (H - 1), slope = Math.hypot(sx, sy) * RINGS + 0.4
    const band = h * RINGS, f = band - Math.floor(band), line = smooth(1.5, 0.7, (Math.min(f, 1 - f) / slope) * 300)
    const index = (Math.floor(band + 0.5) + 400) % 5 === 0 ? 1 : 0.62
    return Math.max(line * index, 0.24 * smooth(0.5, 1, h))
  }
  const place = (e: PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); px = (e.clientX - r.left) / r.width; py = (e.clientY - r.top) / r.height }
  return <DitherField fill kind={map} ramp={['none', '--warp-color-border-strong', '--warp-color-text-subtle', '--warp-color-accent-text']} cell={2} spread={0.4} gain={1.6} seed={40} speed={live ? 1 : 0} onPointerMove={place} onPointerLeave={() => { px = -1 }} label="A contour map of invented hills" />
}
