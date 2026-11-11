import { Stack, Text, VirtualList } from '@kerf/veneer'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { NOTES } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export const VirtualListTallRows = () => (
  <VirtualList
    label="Release notes"
    items={NOTES}
    rowKey={(n) => n.id}
    text={(n) => n.text}
    estimate={72}
    height="360px"
  >
    {(note) => (
      <Stack gap="hair">
        <Text role="label">{note().who}</Text>
        <Text data-measure="">{note().text}</Text>
      </Stack>
    )}
  </VirtualList>
)
