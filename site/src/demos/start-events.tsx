import { state } from '@kerf/core'
import { Button, Card } from '@kerf/veneer'

export default function Bell() {
  const rang = state(false)
  const ring = () => {
    rang.value = true
  }
  return (
    <Card title="The counter is empty">
      <p>
        {rang.value
          ? 'Someone is coming.'
          : 'Ring the bell and wait.'}
      </p>
      <Button onClick={ring}>Ring the bell</Button>{' '}
      <Button
        emphasis="ghost"
        tone="neutral"
        onClick={() => (rang.value = false)}
      >
        Start again
      </Button>
    </Card>
  )
}
