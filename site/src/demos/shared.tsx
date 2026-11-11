import { state } from '@kerf/core'
import { Button, Card, Checkbox } from '@kerf/veneer'

// One list, two views. In a real app it comes from
// a server `query`.
const task = (id: number, text: string) => ({
  id,
  text,
  done: state(false),
})
const todos = state([
  task(1, 'Book flights'),
  task(2, 'Pack'),
])
const add = (who: string) => {
  const id = todos.value.length + 1
  todos.value = [...todos.value, task(id, `From ${who}`)]
}

export default function Shared() {
  return (
    <div data-part="panes">
      {['Ana', 'Ben'].map((who) => (
        <Card
          key={who}
          title={who}
        >
          {todos.value.map((t) => (
            <Checkbox
              key={t.id}
              checked={t.done.value}
              onChange={(
                e: Event & {
                  currentTarget: HTMLInputElement
                },
              ) =>
                (t.done.value = e.currentTarget.checked)
              }
            >
              {t.text}
            </Checkbox>
          ))}
          <Button
            emphasis="ghost"
            tone="neutral"
            onClick={() => add(who)}
          >
            Add a task
          </Button>
        </Card>
      ))}
    </div>
  )
}
