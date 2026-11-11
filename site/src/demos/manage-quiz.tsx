import { derived, state } from '@kerf/core'
import {
  Alert,
  Button,
  Card,
  Textarea,
} from '@kerf/veneer'

type Status = 'typing' | 'submitting' | 'success'

// Pretends to ask a server: it waits, then accepts
// "lima" and refuses anything else.
const check = (answer: string) =>
  new Promise<void>((resolve, reject) => {
    const right = answer.trim().toLowerCase() === 'lima'
    setTimeout(
      () =>
        right
          ? resolve()
          : reject(
              new Error('Good guess, but no. Try again.'),
            ),
      800,
    )
  })

export default function Quiz() {
  const answer = state('')
  const status = state<Status>('typing')
  const error = state<string | null>(null)
  const empty = derived(() => answer.value.trim() === '')

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    status.value = 'submitting'
    try {
      await check(answer.value)
      status.value = 'success'
    } catch (err) {
      status.value = 'typing'
      error.value =
        err instanceof Error ? err.message : String(err)
    }
  }

  const updateAnswer = (value: string) => {
    answer.value = value
    error.value = null
  }

  return (
    <Card title="City quiz">
      {status.value === 'success' ? (
        <Alert
          tone="positive"
          title="That's right!"
        >
          Lima is the capital of Peru.
        </Alert>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <p>Which city is the capital of Peru?</p>
          <Textarea
            label="Your answer"
            value={answer.value}
            disabled={status.value === 'submitting'}
            error={error.value}
            onInput={(e) =>
              updateAnswer(e.currentTarget.value)
            }
          />
          <Button
            type="submit"
            loading={status.value === 'submitting'}
            disabled={empty.value}
          >
            Submit
          </Button>
        </form>
      )}
    </Card>
  )
}
