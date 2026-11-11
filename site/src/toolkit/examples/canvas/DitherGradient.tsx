import { Dither } from '@kerf/veneer'
import { SOFT } from './paint-primitives'

export const DitherGradient = () => (
  <Dither
    gradient={SOFT}
    ramp="accent"
    ratio="21 / 9"
  />
)
