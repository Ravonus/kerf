import { DitherField } from '@weft-js/warp'
import { smooth, type ArtProps, type Meta } from './shared'
import code from './tide-table.tsx?raw'

export const meta: Meta = { name: 'Tide Table', description: 'Five horizons, each a little closer and heavier than the last. Good for the seam between two sections.', kind: 'field', code, wide: true }

const { sin } = Math, BANDS = 6, SLOTS = 320, SPAN = 4
const crests = new Float32Array(BANDS * SLOTS)
let stamp = NaN

// Every cell in a column shares its crests, so they go in a table once per frame and the cells only compare against it.
function tabulate(t: number) {
  stamp = t
  for (let i = 0; i < BANDS; i++) for (let n = 0; n < SLOTS; n++) {
    const x = (n / SLOTS) * SPAN
    crests[i * SLOTS + n] = 0.14 + i * 0.145 + sin(x * (1.1 + i * 0.55) + t * (0.18 + i * 0.05) + i * 2.1) * (0.016 + i * 0.008) + sin(x * (3.1 + i * 0.9) - t * 0.11 + i) * 0.008
  }
}

function horizons(x: number, y: number, t: number) {
  if (t !== stamp) tabulate(t)
  const n = (x / SPAN) * SLOTS | 0
  let tone = 0
  for (let i = 0; i < BANDS; i++) {
    const under = y - crests[i * SLOTS + n]!
    if (under > 0) tone = (0.66 + i * 0.07) * (0.62 + 0.38 * smooth(0.12, 0, under)) + 0.16 * smooth(0.012, 0, under)
  }
  return tone
}

export default function TideTable({ live = true }: ArtProps) {
  return <DitherField fill kind={horizons} ramp={['none', '--warp-color-accent-soft', '--warp-color-accent-border', '--warp-color-accent-text']} pattern="blue" fade="top" cell={3} gain={1.25} seed={9} speed={live ? 1 : 0} label="Five stacked horizons, thinning toward the top" />
}
