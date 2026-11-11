import { Cover } from '@kerf-js/veneer'
import { Box, SCREEN } from './shared'

export const CoverParts = () => (
  <Cover style={SCREEN}>
    <Box>Header hugs the top</Box>
    <Box
      data-part="center"
      tall={96}
    >
      data-part="center"
    </Box>
    <Box>Footer hugs the bottom</Box>
  </Cover>
)
