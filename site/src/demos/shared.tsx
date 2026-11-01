import { state } from 'weft'
import { Button, Card, Checkbox } from '@weft/warp'

// One list, two views of it. In a real app the list comes from a server `query`.
const todos = state([{ id: 1, text: 'Book flights' }, { id: 2, text: 'Pack' }])
const add = (who: string) => (todos.value = [...todos.value, { id: Date.now(), text: `From ${who}` }])

export default function Shared() {
  return (
    <div data-part="panes">
      {['Ana', 'Ben'].map(who => (
        <Card key={who} title={who}>
          {todos.value.map(t => <Checkbox key={t.id}>{t.text}</Checkbox>)}
          <Button emphasis="ghost" tone="neutral" onClick={() => add(who)}>Add a task</Button>
        </Card>
      ))}
    </div>
  )
}
