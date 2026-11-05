import { Inset, Row, Spacer } from '@weft-js/warp'
import { Box } from './shared'

export const SpacerTwo = () => (
  <Inset>
    <Row gap="tight">
      <Box>Start</Box>
      <Spacer />
      <Box>Middle</Box>
      <Spacer />
      <Box>End</Box>
    </Row>
  </Inset>
)
