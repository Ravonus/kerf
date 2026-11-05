import { Grid, Stack, Text } from '@weft-js/warp'
import { Box, SIX, GAPS } from './shared'

export const GridGaps = () => (
  <Grid min="sm" cols={2} gap="section">
    {GAPS.map((gap) => (
      <Stack key={gap} gap="tight">
        <Text role="label" subtle>
          gap="{gap}"
        </Text>
        <Grid min="xs" cols={3} gap={gap}>
          {SIX.map((n) => (
            <Box key={n}>{n}</Box>
          ))}
        </Grid>
      </Stack>
    ))}
  </Grid>
)
