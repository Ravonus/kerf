import { state } from '@weft-js/core'

import { Kanban } from '@weft-js/warp'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { BOARD } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export function KanbanPlay(p: { height: string }) {
  const columns = state(BOARD)
  return (
    <Kanban
      label="Release board"
      columns={columns}
      height={p.height}
    />
  )
}
