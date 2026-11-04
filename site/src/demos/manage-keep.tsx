import { state } from '@weft-js/core'
import { Button, Card, Input, Row } from '@weft-js/warp'

type Guest = { id: number; name: string }
let nextId = 4

function GuestRow(props: { guest: Guest }) {
  // This box belongs to this row: it moves with the row and goes when the row goes.
  const note = state('')
  return (
    <Input
      label={`${props.guest.name}: dietary note`}
      value={note.value}
      onInput={(e) => (note.value = e.currentTarget.value)}
    />
  )
}

export default function Guests() {
  const guests = state<Guest[]>([
    { id: 1, name: 'Ana' },
    { id: 2, name: 'Ben' },
    { id: 3, name: 'Chloé' },
  ])
  const reverse = () => (guests.value = [...guests.value].reverse())
  const removeFirst = () => (guests.value = guests.value.slice(1))
  const add = () => {
    const id = nextId++
    guests.value = [...guests.value, { id, name: `Guest ${id}` }]
  }
  return (
    <Card title="Dinner guests">
      {guests.value.map((g) => (
        <GuestRow key={g.id} guest={g} />
      ))}
      <Row gap="tight">
        <Button size="sm" onClick={reverse}>
          Reverse
        </Button>
        <Button size="sm" emphasis="outline" onClick={removeFirst}>
          Remove first
        </Button>
        <Button size="sm" emphasis="ghost" onClick={add}>
          Add a guest
        </Button>
      </Row>
    </Card>
  )
}
