import { onCleanup, onMount, state } from '@weft-js/core'

import { Table } from '@weft-js/warp'

import type { Column } from '@weft-js/warp'

import {
  type Project,
  badge,
  WATCHED,
} from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export function TableLive() {
  const ms = state(
    Object.fromEntries(
      WATCHED.map((p) => [p.id, p.latency]),
    ),
  )
  const columns: Column<Project>[] = [
    { id: 'name', header: 'Project', rowHeader: true },
    { id: 'status', header: 'Status', cell: badge },
    {
      id: 'latency',
      header: 'Latency (ms)',
      numeric: true,
      live: true,
      value: (p) => ms.get(p.id),
    },
  ]
  const tick = () => {
    const next = { ...ms.value }
    for (const id in next)
      next[id] = Math.max(
        12,
        next[id]! + Math.round(Math.random() * 24 - 12),
      )
    ms.value = next
  }
  onMount(() => {
    const timer = setInterval(tick, 1200)
    onCleanup(() => clearInterval(timer))
  })
  return (
    <Table
      caption="Latency now"
      captionHidden
      rows={WATCHED}
      columns={columns}
      picker={false}
    />
  )
}
