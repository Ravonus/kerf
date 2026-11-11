import { Dither } from '@kerf-js/veneer'

export const GLOW = { radial: true, from: 1, to: 0 }

export const DitherRadial = () => (
  <Dither
    gradient={GLOW}
    ramp="info"
    ratio="21 / 9"
    label="A soft blue glow"
  />
)
