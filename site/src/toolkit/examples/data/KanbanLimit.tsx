import { state } from '@kerf/core'

import { Kanban } from '@kerf/veneer'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { OVER } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export function KanbanLimit() {
  const columns = state(OVER)
  return (
    <Kanban
      label="Over its limit"
      columns={columns}
      height="360px"
    />
  )
}
