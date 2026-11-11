import { Row } from '@kerf/veneer'
import { Box } from './shared'

export const RowGrow = () => (
  <Row
    gap="related"
    wrap={false}
  >
    <Box>Fixed</Box>
    <Box data-grow="">data-grow takes the rest</Box>
    <Box>Fixed</Box>
  </Row>
)
