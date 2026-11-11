import { onCleanup, onMount, state } from '@kerf-js/core'

import {
  Button,
  Row,
  Stack,
  Toggle,
  VirtualList,
} from '@kerf-js/veneer'

import type { VirtualControl } from '@kerf-js/veneer'

import { money as _Shared0 } from './shared-project'

import { STATUSES as _Shared1 } from './shared-statuses'

import { LINES, logLine } from './shared-lazy'

import { toneOf as _Shared3 } from './shared-tone-of'

import { REGIONS as _REGIONS } from '../../world'

export function VirtualListTail() {
  const lines = state(LINES.slice(0, 40))
  const paused = state(false)
  const stuck = state(true)
  let list: VirtualControl | undefined
  const arrive = () => {
    if (!paused.value)
      lines.value = [
        ...lines.value,
        LINES[lines.value.length]!,
      ]
  }
  onMount(() => {
    const timer = setInterval(arrive, 700)
    onCleanup(() => clearInterval(timer))
  })
  return (
    <Stack gap="related">
      <Row gap="tight">
        <Toggle
          size="sm"
          icon="pause"
          pressed={paused.value}
          onClick={() => (paused.value = !paused.value)}
        >
          Pause
        </Toggle>
        <Button
          size="sm"
          emphasis="ghost"
          tone="neutral"
          aria-disabled={stuck.value ? 'true' : undefined}
          onClick={() => list?.scrollToEnd()}
        >
          Jump to latest
        </Button>
      </Row>
      <VirtualList
        label="Live log"
        role="log"
        open
        from="end"
        stick={48}
        items={lines.value}
        rowKey={(l) => l.id}
        estimate={38}
        height="280px"
        onStick={(s) => (stuck.value = s)}
        control={(c) => (list = c)}
      >
        {logLine}
      </VirtualList>
    </Stack>
  )
}
