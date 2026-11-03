import { DitherField } from '@weft-js/warp'
import { type ArtProps, type Meta } from './shared'
import code from './moire-loom.tsx?raw'

export const meta: Meta = { name: 'Moiré Loom', description: 'Two gratings, a few degrees apart, and everything else is the eye. Click to drop a ring through them.', kind: 'field', code }

const { sin, cos } = Math

function beats(x: number, y: number, t: number) {
  const a = 0.06 + sin(t * 0.07) * 0.03, c = cos(a), s = sin(a), k = 118
  const lift = sin(x * 1.1 + t * 0.1) * 0.5 + sin(y * 1.7 - t * 0.08) * 0.5
  const one = 0.5 + 0.5 * sin(y * k + lift), two = 0.5 + 0.5 * sin((x * s + y * c) * k * 1.04 - lift + t * 0.12)
  return Math.sqrt(one * two) * 0.96
}

export default function MoireLoom({ live = true }: ArtProps) {
  return <DitherField fill kind={beats} spark="accent" ramp="neutral" spread={0.5} pointer="shockwave" cell={2} gain={1.2} seed={21} speed={live ? 1 : 0} label="Two line gratings beating against each other" />
}
