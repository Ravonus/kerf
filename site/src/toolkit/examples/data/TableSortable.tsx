import { state } from '@weft-js/core'

import { Stack, Table, Text } from '@weft-js/warp'

import type { TableSort } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { COLUMNS } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export function TableSortable() {
  const sort = state<TableSort | undefined>({
    id: 'cost',
    dir: 'descending',
  })
  return (
    <Stack gap="related">
      <Text subtle>
        Sorted by {sort.value?.id}, {sort.value?.dir}.
      </Text>
      <Table
        caption="Projects by cost"
        captionHidden
        rows={PROJECTS}
        columns={COLUMNS}
        sort={sort}
        picker={false}
      />
    </Stack>
  )
}
