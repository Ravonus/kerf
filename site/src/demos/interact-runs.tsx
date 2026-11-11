import { derived, state } from '@kerf/core'
import { Button, Card } from '@kerf/veneer'

export default function Runs() {
  const apples = state(0)
  const pears = state(0)
  // Each derived counts its own runs, so you can see
  // which work a write caused.
  let appleRuns = 0
  let pearRuns = 0
  const appleLine = derived(() => ({
    text: `${apples.value} apples`,
    runs: ++appleRuns,
  }))
  const pearLine = derived(() => ({
    text: `${pears.value} pears`,
    runs: ++pearRuns,
  }))
  return (
    <Card title="Who runs on a write">
      <p>
        {appleLine.value.text}, computed{' '}
        {appleLine.value.runs} times
      </p>
      <p>
        {pearLine.value.text}, computed{' '}
        {pearLine.value.runs} times
      </p>
      <Button
        size="sm"
        onClick={() => apples.value++}
      >
        Add an apple
      </Button>
      <Button
        size="sm"
        emphasis="outline"
        onClick={() => pears.value++}
      >
        Add a pear
      </Button>
      <Button
        size="sm"
        emphasis="ghost"
        onClick={() => (apples.value = 5)}
      >
        Set apples to 5
      </Button>
    </Card>
  )
}
