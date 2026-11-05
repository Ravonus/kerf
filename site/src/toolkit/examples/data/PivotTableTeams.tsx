import { PivotTable } from '@weft-js/warp'

import { PEOPLE } from '../../world'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { HEADS } from './shared-tone-of'

export const PivotTableTeams = () => (
  <PivotTable
    caption="People by team and role"
    rows={PEOPLE}
    row={(p) => p.team}
    column={(p) => p.role}
    rowHeader="Team"
    measures={HEADS}
  />
)
