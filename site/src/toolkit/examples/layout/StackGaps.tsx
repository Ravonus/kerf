import { Grid, Stack, Text } from '@kerf/veneer'
import { Box, STACK_GAPS } from './shared'

export const StackGaps = () => (
  <Grid
    min="xs"
    gap="group"
  >
    {STACK_GAPS.map((gap) => (
      <Stack
        key={gap}
        gap="tight"
      >
        <Text
          role="label"
          subtle
        >
          {gap}
        </Text>
        <Stack gap={gap}>
          <Box>One</Box>
          <Box>Two</Box>
          <Box>Three</Box>
        </Stack>
      </Stack>
    ))}
  </Grid>
)
