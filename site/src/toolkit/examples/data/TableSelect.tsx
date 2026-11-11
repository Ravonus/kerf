import { state } from '@kerf-js/core'

import { Button, Table } from '@kerf-js/veneer'

import { PROJECTS } from '../../world'

import { COLUMNS } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export function TableSelect() {
  const rows = state(PROJECTS)
  const picked = state<Record<string, boolean>>({})
  const pause = (keys: string[]) => {
    rows.value = rows.value.map((p) =>
      keys.includes(p.id)
        ? { ...p, status: 'Paused' as const }
        : p,
    )
    picked.value = {}
  }
  const remove = (keys: string[]) => {
    rows.value = rows.value.filter(
      (p) => !keys.includes(p.id),
    )
    picked.value = {}
  }
  return (
    <Table
      caption="Projects"
      captionHidden
      rows={rows}
      columns={COLUMNS}
      picker={false}
      selection={picked}
      bulk={(keys) => (
        <>
          <Button
            size="sm"
            emphasis="outline"
            tone="neutral"
            icon="pause"
            onClick={() => pause(keys)}
          >
            Pause
          </Button>
          <Button
            size="sm"
            emphasis="outline"
            tone="critical"
            icon="trash"
            onClick={() => remove(keys)}
          >
            Delete
          </Button>
        </>
      )}
    />
  )
}
