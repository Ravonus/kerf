import { PivotTable } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { MEASURES } from './shared-tone-of'

export const PivotTablePlay = (p: {
  rowHeader: string
}) => (
  <PivotTable
    caption="Projects by region and status"
    rows={PROJECTS}
    row={(r) => r.region}
    column={(r) => r.status}
    rowHeader={p.rowHeader}
    measures={MEASURES}
  />
)
