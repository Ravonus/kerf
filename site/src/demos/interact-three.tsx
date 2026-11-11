import { state } from '@kerf/core'
import { Button, Card } from '@kerf/veneer'

export default function Three() {
  const score = state(0)
  const note = state('')
  const addThree = () => {
    // Each line reads the value the previous line wrote:
    // there is no snapshot.
    score.value = score.value + 1
    score.value = score.value + 1
    score.value = score.value + 1
    const count = score.value
    note.value = `The handler saw ${count} at its end.`
  }
  return (
    <Card title="Three writes in a row">
      <p>
        <strong>Score {score.value}</strong>
      </p>
      <Button
        size="sm"
        onClick={addThree}
      >
        +3
      </Button>
      <Button
        size="sm"
        emphasis="ghost"
        onClick={() => (score.value = 0)}
      >
        Reset
      </Button>
      <p>{note.value}</p>
    </Card>
  )
}
