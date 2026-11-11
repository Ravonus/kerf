import { DataGrid } from '@kerf/veneer'

import { PROJECTS } from '../../world'

import { money as _Shared0 } from './shared-project'

import { GRID } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const DataGridBasic = () => (
  <DataGrid
    caption="Projects"
    captionHidden
    rows={PROJECTS}
    columns={GRID}
    exportName="kerf-projects"
  />
)
