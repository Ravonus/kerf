import { DitherField } from '@weft/warp'
import { type ArtProps, type Meta } from './shared'
import code from './caustics.tsx?raw'

export const meta: Meta = { name: 'Caustics', description: 'Light on the floor of a pool. The water folds it into bright threads, and they never quite repeat.', kind: 'shader', code, wide: true }

const { sin, cos, sqrt, abs } = Math

function pool(x: number, y: number, t: number) {
  const k = 6.283, px = (x * 1.1 * k) % k - 250, py = (y * 1.1 * k) % k - 250, T = t * 0.42 + 23
  let ix = px, iy = py, c = 1
  for (let n = 0; n < 3; n++) {
    const a = T * (1 - 3.5 / (n + 1)), nx = px + cos(a - ix) + sin(a + iy), ny = py + sin(a - iy) + cos(a + ix)
    ix = nx
    iy = ny
    const u = px / (sin(ix + a) / 0.005), v = py / (cos(iy + a) / 0.005)
    c += 1 / sqrt(u * u + v * v)
  }
  c = 1.17 - (c / 3) ** 1.4
  const v = abs(c)
  return v * v * v * v * v * v * 1.2
}

export default function Caustics({ live = true }: ArtProps) {
  return <DitherField fill kind={pool} pattern="blue" ramp={['none', '--warp-color-info-soft', '--warp-color-info-border', '--warp-color-info-text']} cell={3} gain={1.5} seed={6} speed={live ? 1 : 0} label="Caustic light on the floor of a pool" />
}
