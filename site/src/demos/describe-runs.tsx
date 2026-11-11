import { derived, state } from '@kerf-js/core'
import { Button, Card } from '@kerf-js/veneer'

export default function RunsOnce() {
  const clicks = state(0)
  // A plain local. The body runs once, so this variable
  // is made once and lives as long as the component.
  let worked = 0
  const line = derived(() => {
    worked += 1
    return (
      `${clicks.value} clicks. This line has been ` +
      `worked out ${worked} times.`
    )
  })
  return (
    <Card title="One body, many updates">
      <p>{line.value}</p>
      <p>
        The component body ran once: it made the button
        and the paragraph above.
      </p>
      <Button onClick={() => clicks.value++}>
        Click
      </Button>
    </Card>
  )
}
