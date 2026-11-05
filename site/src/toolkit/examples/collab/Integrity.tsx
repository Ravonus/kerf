import { state } from '@weft-js/core'

import { DataIntegrity } from '@weft-js/warp'

import type { IntegrityEvent } from '@weft-js/warp'

import {
  INTEGRITY_EVENTS,
  INTEGRITY_STATS,
} from '../../world'

import { wait as _Shared0 } from './shared-wait'

export function DataIntegrityChannel() {
  const stats = state(INTEGRITY_STATS)
  const events = state<IntegrityEvent[]>(INTEGRITY_EVENTS)
  const log = (
    note: string,
    change: Partial<typeof INTEGRITY_STATS>,
  ) => {
    const seq = stats.value.sent + 1
    stats.value = { ...stats.value, sent: seq, ...change }
    events.value = [
      {
        id: `e${seq}`,
        seq,
        kind: 'title',
        route: 'You → Jun',
        note,
        lag: 40,
      },
      ...events.value,
    ].slice(0, 5)
  }
  const reset = () => {
    stats.value = {
      sent: 0,
      received: 0,
      duplicate: 0,
      outOfOrder: 0,
      lagP95: 0,
    }
    events.value = []
  }
  return (
    <DataIntegrity
      channel="runbook:rollback"
      stats={stats}
      events={events}
      live="live"
      onInjectDuplicate={() =>
        log('duplicate, ignored', {
          duplicate: stats.value.duplicate + 1,
        })
      }
      onInjectReorder={() =>
        log('out of order', {
          outOfOrder: stats.value.outOfOrder + 1,
        })
      }
      onReset={reset}
    />
  )
}
