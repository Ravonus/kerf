import { state } from '@weft-js/core'

import { Kanban, Stack, Text } from '@weft-js/warp'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { BOARD } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export function KanbanMoves() {
  const columns = state(BOARD)
  const last = state(
    'Move a card. onMove reports where it landed.',
  )
  const moved = (
    id: string,
    column: string,
    index: number,
  ) =>
    (last.value =
      `${id} moved to ${column}, ` +
      `position ${index + 1}.`)
  return (
    <Stack gap="related">
      <Text subtle>{last.value}</Text>
      <Kanban
        label="Release board"
        columns={columns}
        onMove={moved}
        height="420px"
      />
    </Stack>
  )
}
