import { state } from '@weft-js/core'

import { Feed, Stack, Text } from '@weft-js/warp'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { ACTIVITY } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export function FeedLoadMore() {
  const items = state(ACTIVITY.slice(0, 20))
  const busy = state(false)
  const more = async () => {
    if (items.value.length >= ACTIVITY.length) return
    busy.value = true
    await new Promise((done) => {
      setTimeout(done, 700)
    })
    items.value = ACTIVITY.slice(0, items.value.length + 20)
    busy.value = false
  }
  return (
    <Stack gap="related">
      <Text subtle>
        {items.value.length} of {ACTIVITY.length} events{busy.value ? ', loading more' : ''}.
      </Text>
      <Feed
        label="Activity"
        items={items.value}
        height="340px"
        busy={busy.value}
        onEnd={() => void more()}
      />
    </Stack>
  )
}
