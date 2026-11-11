import { DataGrid } from '@kerf-js/veneer'

import { PROJECTS } from '../../world'

import { money as _Shared0 } from './shared-project'

import { GRID } from './shared-statuses'

import { FOUR } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const DataGridPaged = () => (
  <DataGrid
    caption="Projects"
    captionHidden
    rows={PROJECTS}
    columns={GRID}
    page={FOUR}
    exportName={false}
  />
)
