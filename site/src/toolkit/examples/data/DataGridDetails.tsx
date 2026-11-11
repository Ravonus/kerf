import { DataGrid } from '@kerf-js/veneer'

import { PROJECTS } from '../../world'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { DETAIL_GRID, gridDetails } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const DataGridDetails = () => (
  <DataGrid
    caption="Projects"
    captionHidden
    rows={PROJECTS}
    columns={DETAIL_GRID}
    expand={gridDetails}
    exportName={false}
  />
)
