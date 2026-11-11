import { state } from '@kerf-js/core'
import { Button, Inset, Text } from '@kerf-js/veneer'
import type { Note, Participant } from '@kerf-js/veneer'
import { NOTES } from '../../world'

export const pause = (ms: number) =>
  new Promise((done) => {
    setTimeout(done, ms)
  })

export function useInbox() {
  const items = state(NOTES)
  const change = (id: string, patch: Partial<Note>) =>
    (items.value = items.value.map((n) =>
      n.id === id ? { ...n, ...patch } : n,
    ))
  return {
    items,
    onRead: (id: string) => change(id, { read: true }),
    onReadAll: () =>
      (items.value = items.value.map((n) =>
        n.read ? n : { ...n, read: true },
      )),
    onDismiss: (id: string) =>
      (items.value = items.value.filter(
        (n) => n.id !== id,
      )),
    onRestore: (note: Note) =>
      (items.value = [note, ...items.value]),
    onAction: (note: Note, action: string) =>
      change(note.id, {
        read: true,
        actions: undefined,
        detail:
          action === 'approve'
            ? '· approved'
            : note.detail,
      }),
  }
}

export function useControls() {
  const mic = state(true),
    camera = state(true),
    sharing = state(false),
    hand = state(false)
  const side = state<'people' | 'chat' | null>(null)
  const said = state(
    'Use the bar, or Tab to it and press the arrow keys.',
  )
  const onToggle = (c: string) => {
    if (c === 'mic') mic.value = !mic.value
    if (c === 'camera') camera.value = !camera.value
    if (c === 'share') sharing.value = !sharing.value
    if (c === 'hand') hand.value = !hand.value
    if (c === 'chat' || c === 'people')
      side.value = side.value === c ? null : c
    said.value = `Pressed ${c}`
  }
  return {
    mic,
    camera,
    sharing,
    hand,
    side,
    said,
    onToggle,
    onLeave: () => (said.value = 'Left the call'),
  }
}

export const NOTHING: Note[] = []

export const CHAT = () => (
  <Inset pad="group">
    <Text subtle>
      Sam: the rollback finished at 15:41.
    </Text>
  </Inset>
)

export const SLIDE = () => (
  <Inset pad="section">
    <Text role="heading">mobile-bff timeline</Text>
  </Inset>
)

export const INVITE = () => (
  <Button
    emphasis="outline"
    tone="neutral"
    size="sm"
    full
  >
    Invite people
  </Button>
)

export const TILES: Participant[] = [
  {
    id: 'sam',
    name: 'Sam Okafor',
    role: 'host',
    isSpeaking: true,
  },
  { id: 'jun', name: 'Jun Tanaka', isMuted: true },
  {
    id: 'mara',
    name: 'Mara Lindqvist',
    handRaised: true,
  },
  { id: 'lena', name: 'Lena Fischer', network: 'poor' },
  { id: 'tomas', name: 'Tomás Oliveira', isCamOn: false },
  { id: 'ines', name: 'Inés Vidal' },
]
