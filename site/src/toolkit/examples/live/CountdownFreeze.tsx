import { Countdown, Stack, Text } from '@weft-js/warp'

export function CountdownFreeze() {
  const to = Date.now() + 2 * 3600_000 + 14 * 60_000
  return (
    <Stack gap="related" align="center">
      <Text role="label">Deploy freeze starts in</Text>
      <Countdown to={to} label="Deploy freeze starts in" />
    </Stack>
  )
}
