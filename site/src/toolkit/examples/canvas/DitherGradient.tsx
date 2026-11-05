import { Dither } from '@weft-js/warp'
import { SOFT } from './paint-primitives'

export const DitherGradient = () => <Dither gradient={SOFT} ramp="accent" ratio="21 / 9" />
