import { Inset, Row } from '@kerf/veneer'
import { Box } from './shared'
import type { Gap } from './shared'

export const RowPlay = (p: {
  gap?: Gap
  justify?: 'start' | 'between' | 'end' | 'center'
  align?: string
  wrap?: boolean
}) => (
  <Inset>
    <Row
      gap={p.gap}
      justify={p.justify}
      align={
        p.align === 'center'
          ? undefined
          : (p.align as 'start')
      }
      wrap={p.wrap}
    >
      <Box>Short</Box>
      <Box tall={72}>Tall</Box>
      <Box>A little wider</Box>
    </Row>
  </Inset>
)
