import { state } from '@kerf-js/core'

import { Composer, Stack, Text } from '@kerf-js/veneer'

import type {
  ComposerFile,
  ComposerSend,
} from '@kerf-js/veneer'

import { PEERS } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export function ComposerAttach() {
  const files = state<ComposerFile[]>([])
  const sent = state('')
  const send = (m: ComposerSend) => {
    sent.value = m.text
    files.value = []
  }
  return (
    <Stack gap="related">
      <Composer
        label="Message #deploys"
        placeholder="Message #deploys"
        mentions={PEERS}
        files={files.value}
        onAttach={() =>
          (files.value = [
            ...files.value,
            {
              id: `f${files.value.length}`,
              name: 'latency-graph.png',
            },
          ])
        }
        onRemoveFile={(file) =>
          (files.value = files.value.filter(
            (f) => f !== file,
          ))
        }
        onEmoji={(insert) => insert('🚀')}
        onSend={send}
      />
      <Text subtle>
        {sent.value
          ? `Sent: ${sent.value}`
          : 'Type @ to mention someone.'}
      </Text>
    </Stack>
  )
}
