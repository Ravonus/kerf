import { Stack, ToolCall } from '@weft-js/warp'
import { ARGS } from './shared'

const output =
  '1 file changed\nsrc/retry.ts: attempts 2 → 5'

export const ToolCallStates = () => (
  <Stack gap="related">
    <ToolCall
      call={{
        id: 'a',
        name: 'read_logs',
        args: ARGS,
        state: 'running',
      }}
    />
    <ToolCall
      call={{
        id: 'b',
        name: 'compare_deploys',
        args: '{ "from": "d-4801", "to": "d-4819" }',
        state: 'done',
        ms: 410,
        output,
      }}
    />
    <ToolCall
      call={{
        id: 'c',
        name: 'run_checks',
        args: ARGS,
        state: 'failed',
        exit: 1,
        output:
          '1 failed · ap-south · upstream timed out',
      }}
    />
    <ToolCall
      call={{
        id: 'd',
        name: 'delete_branch',
        args: '{ "name": "retry-spike" }',
        state: 'denied',
      }}
    />
  </Stack>
)
