import { Grid, Inset, Stack } from '@kerf-js/veneer'
import { Box, ALIGNS } from './shared'

export const StackAlign = () => (
  <Grid
    min="xs"
    cols={3}
    gap="group"
  >
    {ALIGNS.map((align) => (
      <Inset key={align}>
        <Stack
          gap="tight"
          align={align}
        >
          <Box>{align}</Box>
          <Box>A longer one</Box>
          <Box>Short</Box>
        </Stack>
      </Inset>
    ))}
  </Grid>
)
