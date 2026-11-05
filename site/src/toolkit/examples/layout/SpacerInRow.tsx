import { Inset, Row, Spacer } from '@weft-js/warp'
import { Box } from './shared'

export const SpacerInRow = () => (
  <Inset>
    <Row gap="tight">
      <Box>Left</Box>
      <Box>Left</Box>
      <Spacer />
      <Box>Pushed to the end</Box>
    </Row>
  </Inset>
)
