import { Row } from '@kerf/veneer'
import { Box, TAGS } from './shared'

export const RowWraps = () => (
  <Row gap="tight">
    {TAGS.map((t) => (
      <Box key={t}>{t}</Box>
    ))}
  </Row>
)
