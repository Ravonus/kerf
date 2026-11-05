import { Split, Stack } from '@weft-js/warp'
import { Box, WIDTHS } from './shared'

export const SplitWidths = () => (
  <Stack gap="related">
    {WIDTHS.map((width) => (
      <Split
        key={width}
        width={width}
        gap="related"
      >
        <Box>{width}</Box>
        <Box>Main</Box>
      </Split>
    ))}
  </Stack>
)
