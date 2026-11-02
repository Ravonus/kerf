import { DitherField } from '@weft/warp'
import { noise, type ArtProps, type Meta } from './shared'
import code from './warp-beam.tsx?raw'

export const meta: Meta = { name: 'Warp Beam', description: 'Tense threads run down the loom and catch the light where they cross a slow beam. Drag through them to pluck.', kind: 'field', code, wide: true }

const { abs, sin, exp, pow, PI, floor } = Math
const K = 66, TENSION = Array.from({ length: 512 }, (_, i) => 0.4 + 0.6 * noise(i * 0.61, 2.1) ** 1.2)

// Each row shares its beam, so that is worked out once a row, not once a cell.
let row = -1, stamp = -1, beam = 0, width = 0

function threads(x: number, y: number, t: number) {
  if (y !== row || t !== stamp) {
    row = y
    stamp = t
    beam = 1.3 + 0.7 * sin(t * 0.13) + 0.3 * sin(y * 1.6 + t * 0.21)
    width = 0.9 + 0.35 * sin(y * 2.4 - t * 0.17)
  }
  const phase = x * K + 2.4 * sin(2 * y + x * 1.3 + t * 0.5) + 0.8 * sin(5 * y - x * 2 - t * 0.3)
  const d = x - beam, light = exp(-d * d * width)
  return pow(abs(sin(phase)), 4) * TENSION[floor(phase / PI) & 511]! * (0.42 + 0.68 * light) + 0.34 * light
}

export default function WarpBeam({ live = true }: ArtProps) {
  return <DitherField fill kind={threads} ramp="neutral" spark="accent" pointer="pull" cell={3} gain={1.3} seed={3} speed={live ? 1 : 0} label="Vertical threads lit by a slow beam of light" />
}
