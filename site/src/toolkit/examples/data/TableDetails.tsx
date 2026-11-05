import { Table } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { COLUMNS, details } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const TableDetails = () => (
  <Table
    caption="Projects"
    captionHidden
    rows={PROJECTS}
    columns={COLUMNS}
    expand={details}
    picker={false}
  />
)
