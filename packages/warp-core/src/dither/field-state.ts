import type { FieldOptions } from './field'
import type { Mask } from './mask'
import type { Forces } from './pointer'
import { tier, type Tier } from './ramp'
import { tile } from './tiles'

export type FieldState = {
  o: FieldOptions
  cols: number
  rows: number
  cells: number
  tones: Float32Array
  shown: Float32Array
  heat: Float32Array
  out: Uint32Array
  image: ImageData | undefined
  inks: Uint32Array
  sparks: Uint32Array | undefined
  dials: Tier
  mask: Mask | undefined
  push: Forces | undefined
  ground: Float32Array | undefined
  pattern: ReturnType<typeof tile>
  fresh: boolean
  painted: boolean
  fontsReady: boolean
  hot: boolean
  clock: number
  seen: number
}

export function createFieldState(host: HTMLElement, options: FieldOptions): FieldState {
  return {
    o: options,
    cols: 0,
    rows: 0,
    cells: 0,
    tones: new Float32Array(0),
    shown: new Float32Array(0),
    heat: new Float32Array(0),
    out: new Uint32Array(0),
    image: undefined,
    inks: new Uint32Array(0),
    sparks: undefined,
    dials: tier(host),
    mask: undefined,
    push: undefined,
    ground: undefined,
    pattern: tile(options.pattern ?? 'bayer8'),
    fresh: false,
    painted: false,
    fontsReady: !options.mask,
    hot: false,
    clock: 0,
    seen: 0,
  }
}
