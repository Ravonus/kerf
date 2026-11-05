import { DataGrid } from '@weft-js/warp'

import { money as _Shared0 } from './shared-project'

import { SPEND_COLUMNS } from './shared-statuses'

import { LAZY, LOAD } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export const DataGridLazyTree = () => (
  <DataGrid
    caption="Spend by team"
    captionHidden
    rows={LAZY}
    columns={SPEND_COLUMNS}
    tree={LOAD}
    exportName={false}
  />
)
