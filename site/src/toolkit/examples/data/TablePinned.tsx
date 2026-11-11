import { Table } from '@kerf-js/veneer'

import { PROJECTS } from '../../world'

import { WIDE } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const TablePinned = () => (
  <Table
    caption="Every field of every project"
    captionHidden
    rows={PROJECTS}
    columns={WIDE}
    phone="columns"
  />
)
