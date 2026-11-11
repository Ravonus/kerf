import { derived, state } from '@kerf/core'
import { Button, Card, Input, Row } from '@kerf/veneer'

type Snack = { id: number; title: string }

export default function Snacks() {
  const snacks = state<Snack[]>([
    { id: 1, title: 'Pretzels' },
    { id: 2, title: 'Dried mango' },
    { id: 3, title: 'Rice crackers' },
  ])
  // The id of the chosen snack, not a copy of it: the
  // snack itself lives in one place.
  const chosenId = state(1)
  const chosen = derived(() =>
    snacks.value.find((s) => s.id === chosenId.value),
  )

  // Replace only the snack that changed, so the other
  // rows keep their objects.
  const rename = (id: number, title: string) =>
    (snacks.value = snacks.value.map((s) =>
      s.id === id ? { ...s, title } : s,
    ))

  return (
    <Card title="What's your travel snack?">
      {snacks.value.map((s) => (
        <Row
          key={s.id}
          gap="tight"
          align="baseline"
        >
          <Input
            label={`Snack ${s.id}`}
            value={s.title}
            onInput={(e) =>
              rename(s.id, e.currentTarget.value)
            }
          />
          <Button
            size="sm"
            emphasis={
              chosenId.value === s.id ? 'solid' : 'ghost'
            }
            onClick={() => (chosenId.value = s.id)}
          >
            Choose
          </Button>
        </Row>
      ))}
      <p>You picked: {chosen.value?.title}</p>
    </Card>
  )
}
