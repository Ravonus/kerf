import { DataGrid } from '@weft-js/warp'

import { money as _Shared0 } from './shared-project'

import { SPEND, SPEND_COLUMNS, OWN_KIDS } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export const DataGridTree = () => (
  <DataGrid
    caption="Spend by team"
    captionHidden
    rows={SPEND}
    columns={SPEND_COLUMNS}
    tree={OWN_KIDS}
    filter="Filter teams and projects"
    exportName={false}
  />
)
