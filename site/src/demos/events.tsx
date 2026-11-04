import { state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

export default function Notes() {
  const draft = state('')
  const notes = state<{ id: number; text: string }[]>([])
  const add = () => {
    const text = draft.value.trim()
    if (!text) return
    notes.value = [
      ...notes.value,
      { id: notes.value.length, text },
    ]
    draft.value = ''
  }
  return (
    <Card title="Notes">
      <input
        aria-label="New note"
        placeholder="Type, then press Enter"
        value={draft.value}
        onInput={(e) =>
          (draft.value = e.currentTarget.value)
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter') add()
        }}
      />
      <p>{draft.value.length} characters</p>
      <Button onClick={add}>Add note</Button>
      <ul>
        {notes.value.map((n) => (
          <li key={n.id}>{n.text}</li>
        ))}
      </ul>
    </Card>
  )
}
