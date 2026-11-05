import { DataGrid } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { type Density } from './shared-project'

import { GROUPED_GRID } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const DataGridPlay = (p: {
  density?: Density
  groupBy?: string
  exportName?: string
}) => (
  <DataGrid
    caption="Projects"
    captionHidden
    rows={PROJECTS}
    columns={GROUPED_GRID}
    density={p.density}
    groupBy={p.groupBy === 'none' ? undefined : p.groupBy}
    exportName={
      p.exportName === 'off' ? false : p.exportName
    }
  />
)
