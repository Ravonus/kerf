import { state } from '@kerf-js/core'
import { Button, Card } from '@kerf-js/veneer'

export default function Bubbling() {
  const log = state<string[]>([])
  // Keeps the last four lines, newest last.
  const say = (line: string) =>
    (log.value = [...log.value, line].slice(-4))
  const star = (e: Event) => {
    e.stopPropagation()
    say('Star, stopped here')
  }
  const submit = (e: Event) => {
    e.preventDefault()
    say('Submitted, and the page stayed put')
  }
  return (
    <Card title="Where a click goes">
      <div
        role="toolbar"
        aria-label="Message"
        onClick={() =>
          say('…and the toolbar heard it too')
        }
      >
        <Button
          size="sm"
          onClick={() => say('Open')}
        >
          Open
        </Button>
        <Button
          size="sm"
          emphasis="outline"
          onClick={star}
        >
          Star
        </Button>
      </div>
      <form onSubmit={submit}>
        <Button
          type="submit"
          size="sm"
          emphasis="ghost"
        >
          Submit
        </Button>
      </form>
      <ol>
        {log.value.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </Card>
  )
}
