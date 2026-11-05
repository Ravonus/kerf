import { state } from '@weft-js/core'
import { Button, Popover, Row, Stack, Text } from '@weft-js/warp'

export function PopoverClose() {
  const on = state('Nobody is on call')
  return (
    <Stack gap="related" align="center">
      <Text subtle>{on.value}</Text>
      <Popover
        label="Take the pager"
        title="Go on call?"
        description="Alerts for every project will come to you tonight."
      >
        <Row gap="related" justify="end">
          <Button size="sm" emphasis="ghost" tone="neutral" data-close-popover="">
            Not now
          </Button>
          <Button size="sm" data-close-popover="" onClick={() => (on.value = 'You are on call')}>
            Go on call
          </Button>
        </Row>
      </Popover>
    </Stack>
  )
}
