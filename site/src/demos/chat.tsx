import { skip } from '@weft-js/start'
import { state } from '@weft-js/core'
import { Badge, Button, Card, Input } from '@weft-js/warp'
import { wire } from '../lib/wire'
import { room } from '../server/chat'

export default function Chat() {
  const joined = state(false)
  const up = state(true)
  const draft = state('')
  const id = crypto.randomUUID()
  const chat = room.connect(() => (joined.value ? { roomId: id } : skip))
  const said = chat.collect('said', { max: 50, key: m => m.id })
  const send = (e: Event) => {
    e.preventDefault()
    void chat.send('say', { text: draft.value || 'Hello' })
    draft.value = ''
  }
  const join = () => {
    wire(true)
    joined.value = true
  }
  const toggle = () => {
    up.value = !up.value
    wire(up.value)
  }
  return (
    <Card title="Chat">
      <Badge>{chat.status.value}</Badge>
      {!joined.value && <Button onClick={join}>Join</Button>}
      {joined.value && (
        <form onSubmit={send}>
          <ol data-part="said">
            {said.value.map(m => (
              <li key={m.id}><b>{m.who}</b> {m.text}</li>
            ))}
          </ol>
          <Input
            label="Message"
            value={draft.value}
            onInput={(e: any) => (draft.value = e.currentTarget.value)}
          />
          <Button type="submit" disabled={!up.value}>Send</Button>
          <Button
            type="button"
            emphasis="ghost"
            tone="neutral"
            onClick={toggle}
          >
            {up.value ? 'Cut the wire' : 'Restore the wire'}
          </Button>
        </form>
      )}
    </Card>
  )
}
