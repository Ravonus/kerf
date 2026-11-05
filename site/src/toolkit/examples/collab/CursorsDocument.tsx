import { onCleanup, onMount, state } from '@weft-js/core'

import { Cursors, Heading, Stack, Text } from '@weft-js/warp'

import type { CursorPeer } from '@weft-js/warp'

import { CURSOR_PEERS } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export function CursorsDocument() {
  const peers = state<CursorPeer[]>(CURSOR_PEERS)
  onMount(() => {
    let tick = 0
    const timer = setInterval(() => {
      tick++
      peers.value = CURSOR_PEERS.map((p, i) => ({
        ...p,
        cursor: { ...p.cursor!, x: 0.2 + 0.6 * Math.abs(Math.sin(tick / 2 + i)) },
      }))
    }, 1400)
    onCleanup(() => clearInterval(timer))
  })
  return (
    <Stack gap="related" style="position:relative">
      <div data-anchor="title">
        <Heading level={3}>Rollback runbook</Heading>
      </div>
      <div data-anchor="body">
        <Text subtle>
          When a deploy fails its health check, roll back first and read the logs second. A failed
          deploy never blocks the next one, and the person on call owns the call.
        </Text>
      </div>
      <Cursors peers={peers} idle={3600000} />
    </Stack>
  )
}
