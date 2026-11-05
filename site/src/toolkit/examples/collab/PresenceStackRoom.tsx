import { state } from '@weft-js/core'

import { Button, PresenceStack, Row, Stack } from '@weft-js/warp'

import { PEERS } from '../../world'

import { wait as _Shared0 } from './shared-wait'

// -- presence --

export function PresenceStackRoom() {
  const peers = state(PEERS.slice(0, 3))
  const join = () => (peers.value = PEERS.slice(0, peers.value.length + 1))
  const leave = () => (peers.value = peers.value.slice(0, -1))
  return (
    <Stack gap="related" align="center">
      <PresenceStack peers={peers} max={4} />
      <Row gap="tight">
        <Button
          size="sm"
          emphasis="outline"
          tone="neutral"
          aria-disabled={peers.value.length === PEERS.length ? 'true' : undefined}
          onClick={join}
        >
          Someone joins
        </Button>
        <Button
          size="sm"
          emphasis="ghost"
          tone="neutral"
          aria-disabled={peers.value.length < 2 ? 'true' : undefined}
          onClick={leave}
        >
          Someone leaves
        </Button>
      </Row>
    </Stack>
  )
}
