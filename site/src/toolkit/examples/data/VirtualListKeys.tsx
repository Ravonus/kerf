import { state } from '@weft-js/core'

import { Row, Stack, Text, VirtualList } from '@weft-js/warp'

import { PROJECTS } from '../../world'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LAZY as _Shared2 } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

export function VirtualListKeys() {
  const picked = state(0)
  return (
    <Stack gap="related">
      <Text subtle>
        Press Tab into the list, then the arrow keys, Home and End. Picked:{' '}
        {PROJECTS[picked.value]!.name}.
      </Text>
      <VirtualList
        label="Projects"
        items={PROJECTS}
        rowKey={(p) => p.id}
        estimate={38}
        height="240px"
        roving
        onRowKey={(e, c) => {
          if (e.key === 'Enter') picked.value = PROJECTS.findIndex((p) => p.id === c.active())
        }}
      >
        {(p) => (
          <Row justify="between" gap="tight">
            <Text inline>{p().name}</Text>
            <Text inline role="caption" subtle>
              {p().region}
            </Text>
          </Row>
        )}
      </VirtualList>
    </Stack>
  )
}
