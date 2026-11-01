import { state } from 'weft'
import { Button, Card, Checkbox } from '@weft/warp'

const start = ['Buy beans', 'Grind', 'Brew', 'Drink'].map(id => ({ id }))

export default function Tasks() {
  const tasks = state(start)
  const later = () => (tasks.value = [...tasks.value.slice(1), tasks.value[0]])
  return (
    <Card title="Today">
      {tasks.value.map(t => <Checkbox key={t.id}>{t.id}</Checkbox>)}
      <Button emphasis="ghost" tone="neutral" onClick={later}>Do the first one later</Button>
    </Card>
  )
}
