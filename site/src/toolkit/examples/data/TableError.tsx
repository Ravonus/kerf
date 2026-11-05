import { state } from '@weft-js/core'

import { Table } from '@weft-js/warp'

import { COLUMNS, WATCHED } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export function TableError() {
  const failed = state(true)
  return (
    <Table
      caption="Projects"
      captionHidden
      rows={WATCHED}
      columns={COLUMNS}
      picker={false}
      status={failed.value ? 'error' : undefined}
      error={{ title: 'Projects could not load', text: 'The API timed out. Nothing was lost.' }}
      onRetry={() => (failed.value = false)}
    />
  )
}
