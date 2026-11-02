import { DitherField } from '@weft-js/warp'
import { type ArtProps, type Meta } from './shared'
import code from './caustics.tsx?raw'

export const meta: Meta = { name: 'Caustics', description: 'Light on the floor of a pool. The water folds it into bright threads, and they never quite repeat.', kind: 'shader', code, wide: true }

const { abs, PI } = Math
const SIZE = 4096, WAVE = Float32Array.from({ length: SIZE }, (_, i) => Math.sin((i / SIZE) * PI * 2)), PART = SIZE / (PI * 2)
const sin = (v: number) => WAVE[(v * PART + SIZE * 512) & (SIZE - 1)]!

// Where a warped wave crosses zero there is a thin bright line. Two sheets of those cross and knot into a net.
function sheet(x: number, y: number, t: number) {
  const u = x * 5.2 + 1.5 * sin(y * 3.1 + t * 0.3), w = y * 5.6 + 1.5 * sin(x * 2.7 - t * 0.27), v = (sin(u + t * 0.2) + sin(w - t * 0.17)) * 0.5, k = 1 - abs(v), k2 = k * k, k4 = k2 * k2
  return k4 * k4
}

function pool(x: number, y: number, t: number) {
  const a = sheet(x, y, t), b = sheet(y * 1.3 + 4, x * 1.3 - 2, t * 0.8 + 9)
  return Math.min(1, a * 0.72 + b * 0.5 + a * b * 1.2)
}

export default function Caustics({ live = true }: ArtProps) {
  return <DitherField fill kind={pool} pattern="blue" ramp={['none', '--warp-color-info-soft', '--warp-color-info-border', '--warp-color-info-text']} cell={3} gain={1.5} seed={6} speed={live ? 1 : 0} label="Caustic light on the floor of a pool" />
}
