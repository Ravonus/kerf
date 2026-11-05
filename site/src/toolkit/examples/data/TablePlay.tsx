import { Table } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { type Density, COLUMNS } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

/* -- Table -- */

export const TablePlay = (p: {
  density?: Density
  filter?: string
  selection?: boolean
  picker?: boolean
  phone?: 'cards' | 'columns'
  captionHidden?: boolean
}) => (
  <Table
    caption="Projects"
    captionHidden={p.captionHidden}
    rows={PROJECTS}
    columns={COLUMNS}
    density={p.density}
    filter={p.filter || undefined}
    selection={p.selection}
    picker={p.picker}
    phone={p.phone}
  />
)
