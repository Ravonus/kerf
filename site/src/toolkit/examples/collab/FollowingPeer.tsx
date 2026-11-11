import { state } from '@kerf/core'

import {
  Card,
  Following,
  Heading,
  PresenceStack,
  Row,
  Stack,
  Text,
} from '@kerf/veneer'

import type { Peer } from '@kerf/veneer'

import { IN_CHANNEL } from './shared-wait'

import { REGIONS as _REGIONS } from '../../world'

export function FollowingPeer() {
  const peer = state<Peer | null>(null)
  return (
    <Stack gap="related">
      <Row justify="between">
        <Text subtle>
          Press an avatar to follow them.
        </Text>
        <PresenceStack
          peers={IN_CHANNEL}
          following={peer.value?.id}
          onFollow={(p) => (peer.value = p)}
        />
      </Row>
      <Following
        peer={peer.value}
        onStop={() => (peer.value = null)}
      >
        <Card>
          <Stack gap="related">
            <Heading level={3}>Rollback runbook</Heading>
            <Text subtle>
              When a deploy fails its health check, roll
              back first and read the logs second. A
              failed deploy never blocks the next one.
            </Text>
          </Stack>
        </Card>
      </Following>
    </Stack>
  )
}
