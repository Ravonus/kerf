import { Dither, type Algorithm, type Ramp } from '@weft-js/warp'
import { state } from '@weft-js/core'
import { type ArtProps, type Meta } from './shared'
import code from './ramp-wall.tsx?raw'

export const meta: Meta = { name: 'Ramp Wall', description: 'Every ramp through every pattern, as plates. Click one and its props are on your clipboard.', kind: 'field', code, wide: true, rest: true }

const RAMPS: Ramp[] = ['accent', 'neutral', 'positive', 'caution', 'critical', 'info', 'highlight']
const PATTERNS: Algorithm[] = ['bayer2', 'bayer4', 'bayer8', 'blue', 'halftone']

export default function RampWall(_: ArtProps) {
  const copied = state('')
  const copy = (prop: string) => { void navigator.clipboard?.writeText(prop); copied.value = `${prop} copied` }
  return (
    <div data-art="pierce" data-art-wall="">
      {RAMPS.map(ramp => PATTERNS.map(algorithm => {
        const prop = `<Dither ramp="${ramp}" algorithm="${algorithm}" />`
        return <button key={`${ramp}-${algorithm}`} type="button" aria-label={`${ramp}, ${algorithm}`} onClick={() => copy(prop)}><Dither ramp={ramp} algorithm={algorithm} cell={3} inks={4} gradient={{ angle: 100 }} fill /></button>
      }))}
      <p data-art="readout" role="status">{copied.value}</p>
    </div>
  )
}
