import { Frame, Grid, Text } from '@weft-js/warp'
import { RATIOS } from './shared'

export const FrameRatios = () => (
  <Grid
    min="xs"
    cols={6}
    gap="related"
  >
    {RATIOS.map((ratio) => (
      <Frame
        key={ratio}
        ratio={ratio}
      >
        <Text
          role="caption"
          subtle
        >
          {ratio}
        </Text>
      </Frame>
    ))}
  </Grid>
)
