import { state } from '@weft-js/core'
import {
  Button,
  Card,
  Row,
  Textarea,
} from '@weft-js/warp'

type Person = { id: number; name: string }
const PEOPLE: Person[] = [
  { id: 1, name: 'Ana' },
  { id: 2, name: 'Ben' },
  { id: 3, name: 'Chloé' },
]

function Profile(props: { person: Person }) {
  const { person } = props
  // Two boxes, made fresh with each component.
  const note = state('')
  const starred = state(false)
  return (
    <>
      <Button
        size="sm"
        emphasis={starred.value ? 'solid' : 'outline'}
        onClick={() => (starred.value = !starred.value)}
      >
        {starred.value ? 'Starred' : 'Star'} {person.name}
      </Button>
      <Textarea
        label={`A note about ${person.name}`}
        value={note.value}
        onInput={(e) =>
          (note.value = e.currentTarget.value)
        }
      />
    </>
  )
}

export default function People() {
  const shown = state(PEOPLE[0] as Person)
  return (
    <Card title="A new person, a new profile">
      <Row gap="tight">
        {PEOPLE.map((p) => (
          <Button
            key={p.id}
            size="sm"
            emphasis={
              shown.value.id === p.id ? 'solid' : 'ghost'
            }
            onClick={() => (shown.value = p)}
          >
            {p.name}
          </Button>
        ))}
      </Row>
      {/* A new person key replaces the old row. */}
      {[shown.value].map((p) => (
        <Profile
          key={p.id}
          person={p}
        />
      ))}
    </Card>
  )
}
