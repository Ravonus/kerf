import { Center, Inset } from '@kerf-js/veneer'
import { Box } from './shared'

export const CenterGutter = () => (
  <Inset>
    <Center gutter>
      <Box tall={72}>
        gutter keeps the page's side margin at any width
      </Box>
    </Center>
  </Inset>
)
