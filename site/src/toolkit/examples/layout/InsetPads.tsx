import { Grid, Inset } from '@weft-js/warp'
import { Box } from './shared'

export const InsetPads = () => (
  <Grid
    min="sm"
    cols={2}
    gap="group"
  >
    <Inset>
      <Box>pad="group", the default</Box>
    </Inset>
    <Inset pad="section">
      <Box>pad="section"</Box>
    </Inset>
  </Grid>
)
