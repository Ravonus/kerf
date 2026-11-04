import { state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

export default function Bubbling() {
  const log = state<string[]>([])
  // Keeps the last four lines, newest last.
  const say = (line: string) => (log.value = [...log.value, line].slice(-4))
  return (
    <Card title="Where a click goes">
      <div role="toolbar" aria-label="Message" onClick={() => say('…and the toolbar heard it too')}>
        <Button size="sm" onClick={() => say('Open')}>
          Open
        </Button>
        <Button
          size="sm"
          emphasis="outline"
          onClick={(e) => {
            e.stopPropagation()
            say('Star, stopped here')
          }}
        >
          Star
        </Button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          say('Submitted, and the page stayed put')
        }}
      >
        <Button type="submit" size="sm" emphasis="ghost">
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
