import { Inset, Row, Stack } from '@weft-js/warp'
import { Box, JUSTIFIES } from './shared'

export const RowJustify = () => (
  <Stack gap="related">
    {JUSTIFIES.map((justify) => (
      <Inset key={justify}>
        <Row justify={justify} gap="tight">
          <Box>{justify}</Box>
          <Box>Two</Box>
          <Box>Three</Box>
        </Row>
      </Inset>
    ))}
  </Stack>
)
