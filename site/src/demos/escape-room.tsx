import { state, watch } from '@weft-js/core'
import { Card, Segmented } from '@weft-js/warp'

type Room = 'general' | 'travel' | 'music'

export default function ChatRoom() {
  const room = state<Room>('general')
  const log = state<string[]>([])
  const say = (line: string) => (log.value = [...log.value.slice(-5), line])

  // Runs now, and again whenever `room` changes. The function it returns undoes this run first.
  watch(() => room.value, name => {
    say(`Connecting to #${name}…`)
    const done = setTimeout(() => say(`Connected to #${name}`), 500)
    return () => {
      clearTimeout(done)
      say(`Disconnected from #${name}`)
    }
  })

  return (
    <Card title="One connection at a time">
      <Segmented
        label="Room"
        value={room.value}
        onChange={v => (room.value = v)}
        options={[{ value: 'general', label: 'general' }, { value: 'travel', label: 'travel' }, { value: 'music', label: 'music' }]}
      />
      <ol>{log.value.map((line, i) => <li key={i}>{line}</li>)}</ol>
    </Card>
  )
}
