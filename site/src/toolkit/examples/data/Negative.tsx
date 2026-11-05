import { ScrollGrid } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import {
  MONTH_COLUMNS,
  swing,
  showSwing,
} from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const ScrollGridNegative = () => (
  <ScrollGrid
    label="Change in spend by month"
    corner="Project"
    rows={500}
    columns={MONTH_COLUMNS}
    rowHeader={(r) => `${PROJECTS[r % 10]!.name}-${r}`}
    cell={(r, c) => showSwing(swing(r, Number(c.id)))}
    negative={(r, c) => swing(r, Number(c.id)) < 0}
    height="320px"
  />
)
