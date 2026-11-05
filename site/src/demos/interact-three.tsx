import { state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

export default function Three() {
  const score = state(0)
  const note = state('')
  const addThree = () => {
    // Each line reads the value the previous line wrote:
    // there is no snapshot.
    score.value = score.value + 1
    score.value = score.value + 1
    score.value = score.value + 1
    note.value =
      `The handler saw ${score.value}` + ' at its end.'
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
