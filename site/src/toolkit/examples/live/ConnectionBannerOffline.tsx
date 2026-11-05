import { state } from '@weft-js/core'
import {
  Button,
  ConnectionBanner,
  ConnectionPill,
  Row,
  Stack,
} from '@weft-js/warp'
import { pause } from './shared'

export function ConnectionBannerOffline() {
  const status = state<
    'live' | 'reconnecting' | 'offline'
  >('live')
  const retry = async () => {
    status.value = 'reconnecting'
    await pause(1500)
    status.value = 'live'
  }
  return (
    <Stack gap="related">
      <ConnectionBanner
        state={status}
        onRetry={() => void retry()}
      />
      <Row
        gap="related"
        justify="between"
      >
        <ConnectionPill state={status} />
        <Button
          emphasis="outline"
          tone="neutral"
          size="sm"
          onClick={() =>
            (status.value =
              status.value === 'offline'
                ? 'live'
                : 'offline')
          }
        >
          {status.value === 'offline'
            ? 'Reconnect'
            : 'Lose the connection'}
        </Button>
      </Row>
    </Stack>
  )
}
