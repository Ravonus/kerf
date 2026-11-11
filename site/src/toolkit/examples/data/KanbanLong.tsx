import { state } from '@kerf-js/core'

import { Kanban } from '@kerf-js/veneer'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { SPRINT } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export function KanbanLong() {
  const columns = state(SPRINT)
  return (
    <Kanban
      label="2,000 cards a column"
      columns={columns}
      height="420px"
    />
  )
}
