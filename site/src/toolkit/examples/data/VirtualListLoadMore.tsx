import { state } from '@weft-js/core'

import { Stack, Text, VirtualList } from '@weft-js/warp'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LINES, logLine } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export function VirtualListLoadMore() {
  const shown = state(LINES.slice(0, 30))
  const busy = state(false)
  const more = async () => {
    busy.value = true
    await new Promise((done) => {
      setTimeout(done, 600)
    })
    shown.value = LINES.slice(0, shown.value.length + 30)
    busy.value = false
  }
  return (
    <Stack gap="related">
      <Text subtle>
        {shown.value.length} of {LINES.length} loaded{busy.value ? ', loading more' : ''}.
      </Text>
      <VirtualList
        label="Request log"
        items={shown.value}
        rowKey={(l) => l.id}
        estimate={38}
        height="280px"
        busy={busy.value}
        onEnd={() => void more()}
      >
        {logLine}
      </VirtualList>
    </Stack>
  )
}
