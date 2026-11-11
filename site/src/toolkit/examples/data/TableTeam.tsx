import { Table } from '@kerf/veneer'

import { PEOPLE } from '../../world'

import { TEAM_COLUMNS } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const TableTeam = () => (
  <Table
    caption="Team"
    rows={PEOPLE}
    columns={TEAM_COLUMNS}
    filter="Find a person"
    selection
    picker={false}
  />
)
