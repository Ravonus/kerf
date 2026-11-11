import { state, untrack } from '@kerf-js/core'
import { doc, title } from '../server/doc'
import { cursors, presence, relay, type PeerTransport } from '@kerf-js/multiplayer'
import { Cursors } from '@kerf-js/multiplayer/ui'
import { webrtc } from '@kerf-js/realtime-webrtc'
import { socketio } from '@kerf-js/realtime-socketio'
import { livekit } from '@kerf-js/realtime-livekit'

function chosen(
  urls: { socketio: string; livekit: string } | undefined,
): PeerTransport | undefined {
  const via =
    typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('via')
  if (via === 'webrtc') return webrtc()
  if (via === 'socketio') return socketio({ url: urls!.socketio })
  if (via === 'livekit') return livekit({ url: urls!.livekit })
}

export const load = () => ({
  socketio: process.env.KERF_E2E_SOCKETIO_URL ?? '',
  livekit: process.env.LIVEKIT_URL ?? '',
})

export default function Room(props: { data: { socketio: string; livekit: string } }) {
  const chat = doc.connect({ id: 'lobby' })
  const shared = title.connect({ id: 'lobby' })
  const typing = state(false)
  const live = presence<{ typing: boolean }>(chat as any, {
    state: () => ({ typing: typing.value }),
    transport: chosen(untrack(() => props.data)),
  })
  const pointers = cursors(live)
  const clicks = relay<{ ping: { at: string } }>(chat as any)
  const pinged = state('')
  clicks.on('ping', (e) => {
    pinged.value = `${e.data.at} from ${e.peer === live.self.value ? 'me' : 'a peer'}`
  })
  const notes = chat.collect('noted')
  return (
    <main>
      <p aria-label="status">{chat.status.value}</p>
      <p aria-label="via">{live.via.value}</p>
      <ul aria-label="peers">
        {live.peers.value.map((p) => (
          <li key={p.id}>{`${p.user.name}${p.state?.typing ? ' typing' : ''}`}</li>
        ))}
      </ul>
      <label>
        <input
          type="checkbox"
          aria-label="typing"
          checked={typing.value}
          onChange={(e) => {
            typing.value = e.currentTarget.checked
          }}
        />{' '}
        typing
      </label>
      <input
        aria-label="title"
        value={shared.value}
        onInput={(e) => {
          shared.value = e.currentTarget.value
        }}
      />
      <button onClick={() => clicks.emit('ping', { at: 'card' })}>ping</button>
      <p aria-label="pinged">{pinged.value}</p>
      <button onClick={() => chat.send('note', { text: 'saved' })}>note</button>
      <ol aria-label="notes">
        {notes.value.map((n) => (
          <li key={n.text}>{n.text}</li>
        ))}
      </ol>
      <section
        data-anchor="board"
        aria-label="board"
        style="width:60vw;height:300px;margin:40px;background:#eee"
      />
      <Cursors of={pointers} />
    </main>
  )
}
