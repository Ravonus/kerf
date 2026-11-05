import { skip } from '@weft-js/start'
import { state } from '@weft-js/core'
import { Badge, Button, Card, Input } from '@weft-js/warp'
import { wire } from '../lib/wire'
import { room } from '../server/chat'

export default function Chat() {
  const joined = state(false)
  const up = state(true)
  const draft = state('')
  // LAN HTTP has no randomUUID; use getRandomValues.
  const id = crypto
    .getRandomValues(new Uint32Array(4))
    .join('-')
  const chat = room.connect(() =>
    joined.value ? { roomId: id } : skip,
  )
  const said = chat.collect('said', {
    max: 50,
    key: (m) => m.id,
  })
  const send = (e: Event) => {
    e.preventDefault()
    const message = { text: draft.value || 'Hello' }
    void chat.send('say', message)
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
      {!joined.value && (
        <Button onClick={join}>Join</Button>
      )}
      {chat.status.value === 'unavailable' && (
        <p>
          This site runs on functions, which can't hold
          the chat's socket. Run it with{' '}
          <code>weft dev</code> to try it.
        </p>
      )}
      {joined.value &&
        chat.status.value !== 'unavailable' && (
          <form onSubmit={send}>
            <ol data-part="said">
              {said.value.map((m) => (
                <li key={m.id}>
                  <b>{m.who}</b> {m.text}
                </li>
              ))}
            </ol>
            <Input
              label="Message"
              value={draft.value}
              onInput={(e) =>
                (draft.value = e.currentTarget.value)
              }
            />
            <Button type="submit" disabled={!up.value}>
              Send
            </Button>
            <Button
              type="button"
              emphasis="ghost"
              tone="neutral"
              onClick={toggle}
            >
              {up.value
                ? 'Cut the wire'
                : 'Restore the wire'}
            </Button>
          </form>
        )}
    </Card>
  )
}
