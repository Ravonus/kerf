import { onCleanup, state } from '@weft-js/core'

import { Row, Stack, SyncIndicator, Text, Textarea } from '@weft-js/warp'

import type { SyncState } from '@weft-js/warp'

import { wait as _Shared0 } from './shared-wait'

import { REGIONS as _REGIONS } from '../../world'

export function SyncIndicatorTitle() {
  const sync = state<SyncState>('saved')
  let timer: ReturnType<typeof setTimeout> | undefined
  const edit = () => {
    sync.value = 'saving'
    clearTimeout(timer)
    timer = setTimeout(() => (sync.value = 'saved'), 900)
  }
  onCleanup(() => clearTimeout(timer))
  return (
    <Stack gap="related">
      <Row justify="between">
        <Text role="label">Rollback runbook</Text>
        <SyncIndicator state={sync.value} />
      </Row>
      <Textarea label="Notes" defaultValue="Roll back first, then read the logs." onInput={edit} />
    </Stack>
  )
}
