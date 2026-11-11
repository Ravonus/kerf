import {
  Button,
  Row,
  Stack,
  VirtualList,
} from '@kerf-js/veneer'

import type { VirtualControl } from '@kerf-js/veneer'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LINES, logLine } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export function VirtualListJump() {
  let list: VirtualControl | undefined
  return (
    <Stack gap="related">
      <Row gap="tight">
        <Button
          size="sm"
          emphasis="outline"
          tone="neutral"
          onClick={() => list?.scrollTo(0, 'start')}
        >
          First
        </Button>
        <Button
          size="sm"
          emphasis="outline"
          tone="neutral"
          onClick={() => list?.scrollTo(5000, 'center')}
        >
          Row 5,000
        </Button>
        <Button
          size="sm"
          emphasis="outline"
          tone="neutral"
          onClick={() => list?.scrollToEnd()}
        >
          Last
        </Button>
      </Row>
      <VirtualList
        label="Request log"
        items={LINES}
        rowKey={(l) => l.id}
        estimate={38}
        height="300px"
        control={(c) => (list = c)}
      >
        {logLine}
      </VirtualList>
    </Stack>
  )
}
