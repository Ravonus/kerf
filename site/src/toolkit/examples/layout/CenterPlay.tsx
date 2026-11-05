import { Center } from '@weft-js/warp'
import { Box } from './shared'

export const CenterPlay = (p: {
  max?: 'measure' | 'narrow' | 'content' | 'wide'
  gutter?: boolean
  intrinsic?: boolean
}) => (
  <Center max={p.max} gutter={p.gutter} intrinsic={p.intrinsic}>
    <Box tall={96}>A measured column</Box>
  </Center>
)
