import { state } from '@kerf/core'

import { Stack, Table, Text } from '@kerf/veneer'

import { PROJECTS } from '../../world'

import { type Project, PRICED } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export function TableEdit() {
  const rows = state(PROJECTS.slice(0, 5))
  const last = state(
    'Double-click a cell, or focus it and press Enter.',
  )
  const save = (
    row: Project,
    column: string,
    value: unknown,
  ) => {
    rows.value = rows.value.map((p) =>
      p.id === row.id ? { ...p, [column]: value } : p,
    )
    last.value = `Saved ${column} for ${row.name}.`
  }
  return (
    <Stack gap="related">
      <Text subtle>{last.value}</Text>
      <Table
        caption="Budgets"
        captionHidden
        rows={rows}
        columns={PRICED}
        onEdit={save}
        picker={false}
      />
    </Stack>
  )
}
