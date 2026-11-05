import { state } from '@weft-js/core'

import { Composer, Stack, Text } from '@weft-js/warp'

import type { ComposerFile } from '@weft-js/warp'

import { PEERS } from '../../world'

import { wait as _Shared0 } from './shared-wait'

export function ComposerAttach() {
  const files = state<ComposerFile[]>([])
  const sent = state('')
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
            { id: `f${files.value.length}`, name: 'latency-graph.png' },
          ])
        }
        onRemoveFile={(file) => (files.value = files.value.filter((f) => f !== file))}
        onEmoji={(insert) => insert('🚀')}
        onSend={(m) => {
          sent.value = m.text
          files.value = []
        }}
      />
      <Text subtle>{sent.value ? `Sent: ${sent.value}` : 'Type @ to mention someone.'}</Text>
    </Stack>
  )
}
