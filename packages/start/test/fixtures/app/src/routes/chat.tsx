import { state } from '@kerf/core'
import { room } from '../server/chat'

export default function Chat() {
  const chat = room.connect({ roomId: 'lobby' })
  const said = chat.collect('said')
  const draft = state('')
  return (
    <main>
      <p aria-label="status">{chat.status.value}</p>
      <ul>
        {said.value.map((m) => (
          <li key={m.text}>{m.text}</li>
        ))}
      </ul>
      <input
        aria-label="draft"
        value={draft.value}
        onInput={(e) => {
          draft.value = e.currentTarget.value
        }}
      />
      <button onClick={() => chat.send('say', { text: draft.value })}>send</button>
    </main>
  )
}
