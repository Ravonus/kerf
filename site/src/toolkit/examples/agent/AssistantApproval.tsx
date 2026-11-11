import { state } from '@kerf-js/core'
import {
  Assistant,
  Button,
  Stack,
  foldAnswer,
} from '@kerf-js/veneer'
import {
  ROLLBACK_ASK,
  ROLLBACK_DENIED,
  ROLLBACK_RUN,
} from '../../world'
import { play } from './shared'

export function AssistantApproval() {
  const answer = state(foldAnswer(ROLLBACK_ASK))
  const reset = () =>
    (answer.value = foldAnswer(ROLLBACK_ASK))
  return (
    <Stack gap="related">
      <Assistant
        answer={answer.value}
        quiet
        onApprove={() => play(answer, ROLLBACK_RUN)}
        onDeny={() => play(answer, ROLLBACK_DENIED)}
      />
      {answer.value.state === 'done' && (
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          onClick={reset}
        >
          Start again
        </Button>
      )}
    </Stack>
  )
}
