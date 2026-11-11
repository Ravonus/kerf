import { derived, state } from '@kerf/core'
import { Card, Input, Switch } from '@kerf/veneer'

type Todo = { id: number; text: string; done: boolean }
const TODOS: Todo[] = [
  { id: 1, text: 'Buy oat milk', done: true },
  { id: 2, text: 'Call the bank', done: false },
  { id: 3, text: 'Book the train', done: false },
  { id: 4, text: 'Water the plants', done: true },
]

export default function Todos() {
  const query = state('')
  const showDone = state(true)
  // Worked out from the boxes it reads, when it's
  // read. No effect copies anything into state.
  const visible = derived(() =>
    TODOS.filter(
      (t) =>
        (showDone.value || !t.done) &&
        t.text
          .toLowerCase()
          .includes(query.value.toLowerCase()),
    ),
  )
  const left = derived(
    () => visible.value.filter((t) => !t.done).length,
  )
  return (
    <Card title="Derived, not synced">
      <Input
        label="Search"
        value={query.value}
        onInput={(e) =>
          (query.value = e.currentTarget.value)
        }
      />
      <Switch
        checked={showDone.value}
        onChange={(
          e: Event & { currentTarget: HTMLInputElement },
        ) => (showDone.value = e.currentTarget.checked)}
      >
        Show done
      </Switch>
      <ul>
        {visible.value.map((t) => (
          <li key={t.id}>
            {t.done ? <s>{t.text}</s> : t.text}
          </li>
        ))}
      </ul>
      <p>{left.value} still to do.</p>
    </Card>
  )
}
