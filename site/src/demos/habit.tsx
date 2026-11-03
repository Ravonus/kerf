import { state } from '@weft-js/core'
import { Alert, Button, Card } from '@weft-js/warp'
import show from '../generated/showcase.json'

export default function Habit() {
  const open = state(false)
  return (
    <Card title="weft build">
      <Button onClick={() => (open.value = !open.value)}>
        {open.value ? 'Hide the error' : 'Build the React habit'}
      </Button>
      {open.value && (
        <Alert tone="critical" title={show.habit.code}>
          {show.habit.message}
        </Alert>
      )}
      {open.value && <p>{show.habit.fix}</p>}
    </Card>
  )
}
