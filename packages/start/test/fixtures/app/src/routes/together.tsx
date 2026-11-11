// One browser, one socket: a page that uses `share`, `channel` and `live` at once.
import { state } from '@kerf-js/core'
import { interaction } from '@kerf-js/core/interaction'
import { shareStats } from '../../../../../src/share'
import { room } from '../server/chat'
import { bump, counter } from '../server/feed'
import '../../../../../../veneer/src/ui'
import { Button } from '../../../../../../veneer/src/Button'

if (typeof window !== 'undefined') (window as any).__share = shareStats

export default function Together() {
  const ui = interaction({ share: () => 'person:ana' })
  const hits = counter.live()
  const chat = room.connect({ roomId: 'lobby' })
  const said = chat.collect('said')
  const draft = state('')
  return (
    <main>
      <Button ui={ui}>Ana</Button>
      <p aria-label="remote">{ui.remote.value.hover}</p>
      <p aria-label="status">{hits.live.value}</p>
      <p aria-label="hits">{hits.value?.hits}</p>
      <p aria-label="chat">{chat.status.value}</p>
      <ul aria-label="said">
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
      <button onClick={() => bump()}>bump</button>
    </main>
  )
}
