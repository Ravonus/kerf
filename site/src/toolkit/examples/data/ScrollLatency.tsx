import { ScrollGrid } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { HOURS, latency } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const ScrollGridLatency = () => (
  <ScrollGrid
    label="Latency by hour, in milliseconds"
    corner="Route"
    rows={2000}
    columns={HOURS}
    rowHeader={(r) => `${PROJECTS[r % 10]!.name}/${r}`}
    cell={(r, c) => latency(r, Number(c.id))}
    height="400px"
  />
)
