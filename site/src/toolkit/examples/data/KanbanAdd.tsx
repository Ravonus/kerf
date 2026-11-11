import { state } from '@kerf/core'

import { Kanban } from '@kerf/veneer'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { BOARD } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export function KanbanAdd() {
  const columns = state(BOARD.slice(0, 3))
  let made = 0
  const add = (column: string, title: string) => {
    const next = { id: `new-${made++}`, title }
    columns.value = columns.value.map((c) =>
      c.id === column
        ? { ...c, cards: [...c.cards, next] }
        : c,
    )
  }
  return (
    <Kanban
      label="Release board"
      columns={columns}
      onAdd={add}
      height="440px"
    />
  )
}
