import { Table } from '@kerf/veneer'

import { PROJECTS } from '../../world'

import { COLUMNS, FIVE } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const TablePaged = () => (
  <Table
    caption="Projects"
    captionHidden
    rows={PROJECTS}
    columns={COLUMNS}
    page={FIVE}
    picker={false}
  />
)
