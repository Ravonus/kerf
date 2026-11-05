import { state } from '@weft-js/core'

import { Button, DataGrid } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { money as _Shared0 } from './shared-project'

import { GRID } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export function DataGridBulk() {
  const rows = state(PROJECTS)
  const pause = (keys: string[]) =>
    (rows.value = rows.value.map((p) =>
      keys.includes(p.id)
        ? { ...p, status: 'Paused' as const }
        : p,
    ))
  return (
    <DataGrid
      caption="Projects"
      captionHidden
      rows={rows}
      columns={GRID}
      exportName={false}
      bulk={(keys) => (
        <Button
          size="sm"
          emphasis="outline"
          tone="neutral"
          icon="pause"
          onClick={() => pause(keys)}
        >
          Pause
        </Button>
      )}
    />
  )
}
