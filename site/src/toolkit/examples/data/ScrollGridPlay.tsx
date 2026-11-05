import { ScrollGrid } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { HOURS, latency } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export const ScrollGridPlay = (p: {
  rows: number
  headerWidth: number
}) => (
  <ScrollGrid
    label="Latency by hour, in milliseconds"
    corner="Route"
    rows={p.rows}
    headerWidth={p.headerWidth}
    columns={HOURS}
    rowHeader={(r) => `${PROJECTS[r % 10]!.name}/${r}`}
    cell={(r, c) => latency(r, Number(c.id))}
    height="360px"
  />
)
