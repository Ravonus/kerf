import { state } from 'weft'
import { Button, Card, Checkbox } from '@weft/warp'

const start = ['Buy beans', 'Grind', 'Brew', 'Drink'].map(id => ({ id }))

export default function Tasks() {
  const tasks = state(start)
  const later = () => {
    const [first, ...rest] = tasks.value
    tasks.value = [...rest, first]
  }
  return (
    <Card title="Today">
      {tasks.value.map(t => <Checkbox key={t.id}>{t.id}</Checkbox>)}
      <Button emphasis="ghost" tone="neutral" onClick={later}>
        Do the first one later
      </Button>
    </Card>
  )
}
