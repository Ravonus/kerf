import type { DitherProps } from '@kerf-js/veneer'
import { Dither } from '@kerf-js/veneer'

// -- Dither
export const DitherPlay = (p: DitherProps) => (
  <Dither
    gradient={{ angle: 35 }}
    {...p}
  />
)
