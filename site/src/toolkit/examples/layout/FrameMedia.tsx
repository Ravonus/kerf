import { Frame, Grid } from '@kerf-js/veneer'
import { art } from './shared'

export const FrameMedia = () => (
  <Grid
    min="xs"
    cols={3}
    gap="related"
  >
    <Frame>{art('1', '3')}</Frame>
    <Frame ratio="square">{art('2', '5')}</Frame>
    <Frame ratio="3:4">{art('4', '7')}</Frame>
  </Grid>
)
