import { Grid, Stack, Text } from '@kerf/veneer'
import { Box, EIGHT, MINS } from './shared'

export const GridMinSizes = () => (
  <Stack gap="group">
    {MINS.map((min) => (
      <Stack
        key={min}
        gap="tight"
      >
        <Text
          role="label"
          subtle
        >
          min="{min}"
        </Text>
        <Grid
          min={min}
          gap="tight"
        >
          {EIGHT.map((n) => (
            <Box key={n}>{n}</Box>
          ))}
        </Grid>
      </Stack>
    ))}
  </Stack>
)
