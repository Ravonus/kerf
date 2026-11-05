import { DataGrid } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { money as _Shared0 } from './shared-project'

import { GROUPED_GRID, GROUPED } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const DataGridGroups = () => (
  <DataGrid
    caption="Projects by region"
    captionHidden
    rows={PROJECTS}
    columns={GROUPED_GRID}
    groupBy="region"
    views={GROUPED}
    exportName={false}
  />
)
