import { state } from '@weft-js/core'
import { Button, Stack, ToolCall } from '@weft-js/warp'
import { ROLLBACK } from './shared'

export function ToolCallApproval() {
  const call = state(ROLLBACK)
  const approve = (args: string) => {
    call.value = { ...call.value, args, state: 'running' }
    setTimeout(() => {
      call.value = { ...call.value, state: 'done', ms: 1400, output: 'mobile-bff is on d-4801' }
    }, 1400)
  }
  return (
    <Stack gap="related">
      <ToolCall
        call={call.value}
        quiet
        alwaysAllow="Always allow rollbacks on mobile-bff"
        onApprove={approve}
        onDeny={() => (call.value = { ...call.value, state: 'denied' })}
      />
      {call.value.state !== 'approval' && (
        <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => (call.value = ROLLBACK)}>
          Ask again
        </Button>
      )}
    </Stack>
  )
}
