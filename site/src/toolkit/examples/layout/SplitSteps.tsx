import { Split, Stack, Text } from '@kerf/veneer'
import { Box } from './shared'

export const SplitSteps = () => (
  <Stack gap="group">
    <Stack gap="tight">
      <Text
        role="label"
        subtle
      >
        at="tablet": two columns from 600px
      </Text>
      <Split
        width="nav"
        gap="related"
      >
        <Box>Side</Box>
        <Box>Main</Box>
      </Split>
    </Stack>
    <Stack gap="tight">
      <Text
        role="label"
        subtle
      >
        at="desktop": two columns from 1000px
      </Text>
      <Split
        width="nav"
        gap="related"
        at="desktop"
      >
        <Box>Side</Box>
        <Box>Main</Box>
      </Split>
    </Stack>
  </Stack>
)
