import { state } from '@weft-js/core'
import { Button, Card, Grid } from '@weft-js/warp'

type Guest = { id: number; name: string }

export default function Seating() {
  const guests = state<Guest[]>([
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
    { id: 3, name: 'Alan' },
  ])
  return (
    <Card title="Who brings what">
      <Grid cols={2} gap="group">
        <div>
          <strong>{'key={g.id}'}</strong>
          {guests.value.map(g => (
            <p key={g.id}>
              {g.name} <input aria-label={`${g.name} brings`} size={8} />
            </p>
          ))}
        </div>
        <div>
          <strong>{'key={i}'}</strong>
          {guests.value.map((g, i) => (
            <p key={i}>
              {g.name} <input aria-label={`${g.name} brings, by position`} size={8} />
            </p>
          ))}
        </div>
      </Grid>
      <Button onClick={() => (guests.value = [...guests.value].reverse())}>Reverse the order</Button>
    </Card>
  )
}
