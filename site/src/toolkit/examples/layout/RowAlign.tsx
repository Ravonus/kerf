import { Grid, Heading, Inset, Row, Text } from '@weft-js/warp'
import { Box } from './shared'

export const RowAlign = () => (
  <Grid min="xs" cols={3} gap="group">
    <Inset>
      <Row gap="tight">
        <Box tall={72}>Tall</Box>
        <Box>center</Box>
      </Row>
    </Inset>
    <Inset>
      <Row gap="tight" align="start">
        <Box tall={72}>Tall</Box>
        <Box>start</Box>
      </Row>
    </Inset>
    <Inset>
      <Row gap="tight" align="baseline">
        <Heading level={3}>Heading</Heading>
        <Text subtle>baseline</Text>
      </Row>
    </Inset>
  </Grid>
)
