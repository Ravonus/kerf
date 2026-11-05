import type { DitherProps } from '@weft-js/warp'
import { Dither } from '@weft-js/warp'

// -- Dither
export const DitherPlay = (p: DitherProps) => <Dither gradient={{ angle: 35 }} {...p} />
