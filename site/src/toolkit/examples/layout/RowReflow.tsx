import { Row, Stack, Text } from '@kerf-js/veneer'
import { Box } from './shared'

export const RowReflow = () => (
  <Stack gap="group">
    <Stack gap="tight">
      <Text
        role="label"
        subtle
      >
        reflow="tablet": a stack below 600px
      </Text>
      <Row
        gap="tight"
        reflow="tablet"
      >
        <Box>One</Box>
        <Box>Two</Box>
        <Box>Three</Box>
      </Row>
    </Stack>
    <Stack gap="tight">
      <Text
        role="label"
        subtle
      >
        reflow="desktop": a stack below 1000px
      </Text>
      <Row
        gap="tight"
        reflow="desktop"
      >
        <Box>One</Box>
        <Box>Two</Box>
        <Box>Three</Box>
      </Row>
    </Stack>
  </Stack>
)
