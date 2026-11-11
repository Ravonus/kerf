import type { DitherProps } from '@kerf/veneer'
import { Dither } from '@kerf/veneer'

// -- Dither
export const DitherPlay = (p: DitherProps) => (
  <Dither
    gradient={{ angle: 35 }}
    {...p}
  />
)
