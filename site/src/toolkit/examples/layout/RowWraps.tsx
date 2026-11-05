import { Row } from '@weft-js/warp'
import { Box, TAGS } from './shared'

export const RowWraps = () => (
  <Row gap="tight">
    {TAGS.map((t) => (
      <Box key={t}>{t}</Box>
    ))}
  </Row>
)
