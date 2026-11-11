import { PivotTable } from '@kerf-js/veneer'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { ONE, QUARTERS } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export const PivotTableQuarters = () => (
  <PivotTable
    caption="Quarterly spend by project"
    rows={QUARTERS}
    row={(q) => q.project}
    column={(q) => q.quarter}
    rowHeader="Project"
    measures={ONE}
  />
)
