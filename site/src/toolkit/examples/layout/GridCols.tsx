import { Grid, Stack, Text } from '@kerf-js/veneer'
import { Box, SIX, COLS } from './shared'

export const GridCols = () => (
  <Stack gap="group">
    {COLS.map((cols) => (
      <Stack
        key={cols}
        gap="tight"
      >
        <Text
          role="label"
          subtle
        >
          cols={'{'}
          {cols}
          {'}'}
        </Text>
        <Grid
          min="xs"
          cols={cols}
          gap="tight"
        >
          {SIX.map((n) => (
            <Box key={n}>{n}</Box>
          ))}
        </Grid>
      </Stack>
    ))}
  </Stack>
)
