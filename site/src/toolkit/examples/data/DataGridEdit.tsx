import { state } from '@weft-js/core'

import { DataGrid, Stack, Text } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { type Project } from './shared-project'

import { NUMBERS } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export function DataGridEdit() {
  const rows = state(PROJECTS)
  const last = state('Nothing changed yet.')
  const save = (
    row: Project,
    column: string,
    value: unknown,
  ) => {
    rows.value = rows.value.map((p) =>
      p.id === row.id ? { ...p, [column]: value } : p,
    )
    const result = String(value)
    const message = `${row.name}: ${column} is now `
    last.value = `${message}${result}.`
  }
  return (
    <Stack gap="related">
      <Text subtle>{last.value}</Text>
      <DataGrid
        caption="Budgets"
        captionHidden
        rows={rows}
        columns={NUMBERS}
        onEdit={save}
        exportName={false}
      />
    </Stack>
  )
}
