import { state } from '@kerf-js/core'
import {
  Button,
  Card,
  Row,
  Textarea,
} from '@kerf-js/veneer'

type Contact = { id: number; name: string }
const CONTACTS: Contact[] = [
  { id: 1, name: 'Ana' },
  { id: 2, name: 'Ben' },
  { id: 3, name: 'Chloé' },
]

function Chat({ contact }: { contact: Contact }) {
  // Each contact gets a fresh draft. The edit holds
  // while the key stays the same.
  const draft = state.linked(() => '', {
    key: () => contact.id,
  })
  return (
    <Textarea
      label={`Message to ${contact.name}`}
      value={draft.value}
      onInput={(e) =>
        (draft.value = e.currentTarget.value)
      }
    />
  )
}

export default function Messenger() {
  const to = state(CONTACTS[0] as Contact)
  return (
    <Card title="Messenger">
      <Row gap="tight">
        {CONTACTS.map((c) => (
          <Button
            key={c.id}
            size="sm"
            emphasis={
              to.value.id === c.id ? 'solid' : 'outline'
            }
            onClick={() => (to.value = c)}
          >
            {c.name}
          </Button>
        ))}
      </Row>
      <Chat contact={to.value} />
    </Card>
  )
}
