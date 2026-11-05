import { VirtualList } from '@weft-js/warp'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LINES, logLine } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export const VirtualListPlay = (p: { height: string; gap: number; estimate: number }) => (
  <VirtualList
    label="Request log"
    items={LINES}
    rowKey={(l) => l.id}
    height={p.height}
    gap={p.gap}
    estimate={p.estimate}
  >
    {logLine}
  </VirtualList>
)
