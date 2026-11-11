import { state } from '@kerf/core'
import { Card, Checkbox, Stack } from '@kerf/veneer'

function Item({
  name,
  packed,
  onToggle,
}: {
  name: string
  packed: boolean
  onToggle: () => void
}) {
  return (
    <Checkbox
      checked={packed}
      onChange={onToggle}
    >
      {packed ? <del>{name}</del> : name}
      {packed && <small> (packed)</small>}
    </Checkbox>
  )
}

export default function PackingList() {
  const packed = state({
    suit: true,
    helmet: false,
    photo: false,
  })
  const toggle = (k: 'suit' | 'helmet' | 'photo') =>
    (packed.value = {
      ...packed.value,
      [k]: !packed.value[k],
    })
  return (
    <Card title="Sally Ride's packing list">
      <Stack gap="related">
        <Item
          name="Space suit"
          packed={packed.value.suit}
          onToggle={() => toggle('suit')}
        />
        <Item
          name="Helmet with a golden leaf"
          packed={packed.value.helmet}
          onToggle={() => toggle('helmet')}
        />
        <Item
          name="Photo of Tam"
          packed={packed.value.photo}
          onToggle={() => toggle('photo')}
        />
      </Stack>
    </Card>
  )
}
