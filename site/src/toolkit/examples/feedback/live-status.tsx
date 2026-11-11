import { state } from '@kerf/core'
import {
  Button,
  Grid,
  Heading,
  LiveStatus,
  Row,
  Stack,
  Text,
  Toaster,
  toast,
} from '@kerf/veneer'
import type { LiveState } from '@kerf/veneer'

export const LiveStatusWords = () => (
  <>
    <LiveStatus state="live">Synced</LiveStatus>
    <LiveStatus state="reconnecting">
      Back in a moment
    </LiveStatus>
    <LiveStatus state="offline">
      Saved on this device
    </LiveStatus>
  </>
)

export function LiveStatusDrop() {
  const now = state<LiveState>('live')
  const drop = () => {
    now.value = 'offline'
    setTimeout(() => (now.value = 'reconnecting'), 1200)
    setTimeout(() => (now.value = 'live'), 2800)
  }
  return (
    <>
      <LiveStatus
        state={now.value}
        label="Log stream"
      />
      <Button
        size="sm"
        emphasis="outline"
        tone="neutral"
        disabled={now.value !== 'live'}
        onClick={drop}
      >
        Drop the connection
      </Button>
    </>
  )
}

export const LiveStatusHeader = () => (
  <Row
    justify="between"
    gap="group"
  >
    <Stack gap="hair">
      <Heading level={3}>Logs</Heading>
      <Text subtle>storefront, eu-west</Text>
    </Stack>
    <LiveStatus
      state="live"
      label="Log stream"
    >
      Streaming
    </LiveStatus>
  </Row>
)

const CORNERS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const

export function ToasterPosition() {
  const position =
    state<(typeof CORNERS)[number]>('bottom-right')
  const show = (corner: (typeof CORNERS)[number]) => {
    position.value = corner
    toast.show({
      title: 'Deploy finished',
      description: `Shown ${corner.replace('-', ' ')}.`,
    })
  }
  return (
    <>
      <Grid
        cols={3}
        gap="tight"
      >
        {CORNERS.map((corner) => (
          <Button
            key={corner}
            emphasis="outline"
            tone="neutral"
            onClick={() => show(corner)}
          >
            {corner}
          </Button>
        ))}
      </Grid>
      <Toaster position={position.value} />
    </>
  )
}
