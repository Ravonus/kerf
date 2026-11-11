import { ScrollGrid } from '@kerf/veneer'

import { PROJECTS } from '../../world'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { SIZED, fieldOf } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const ScrollGridWidths = () => (
  <ScrollGrid
    label="Projects"
    corner="Project"
    rows={1000}
    columns={SIZED}
    rowHeader={(r) => `${PROJECTS[r % 10]!.name}-${r}`}
    cell={(r, c) => fieldOf(r, c.id)}
    headerWidth={160}
    height="300px"
  />
)
