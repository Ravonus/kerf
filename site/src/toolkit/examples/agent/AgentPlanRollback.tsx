import { state } from '@weft-js/core'
import {
  AgentPlan,
  Button,
  Row,
  Stack,
} from '@weft-js/warp'
import type { QueuedMessage } from '@weft-js/warp'
import { STEPS, advance } from './shared'

export function AgentPlanRollback() {
  const steps = state(STEPS)
  const queue = state<QueuedMessage[]>([
    {
      id: 'q1',
      text: 'Post a note in #incidents when it is done',
    },
    { id: 'q2', text: 'Then open a fix branch' },
  ])
  const removeQueued = (id: string) =>
    (queue.value = queue.value.filter((q) => q.id !== id))
  return (
    <Stack gap="related">
      <AgentPlan
        title="Rollback"
        steps={steps.value}
        queue={queue.value}
        onRemoveQueued={removeQueued}
      />
      <Row gap="related">
        <Button
          emphasis="outline"
          tone="neutral"
          size="sm"
          onClick={() =>
            (steps.value = advance(steps.value))
          }
        >
          Finish this step
        </Button>
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          onClick={() => (steps.value = STEPS)}
        >
          Reset
        </Button>
      </Row>
    </Stack>
  )
}
