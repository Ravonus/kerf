import { state } from '@kerf-js/core'
import {
  Button,
  Card,
  Checkbox,
  Input,
} from '@kerf-js/veneer'

type Todo = { id: number; title: string; done: boolean }
let nextId = 3

export default function Todos() {
  const draft = state('')
  const todos = state<Todo[]>([
    { id: 0, title: 'Buy milk', done: true },
    { id: 1, title: 'Eat tacos', done: false },
    { id: 2, title: 'Brew tea', done: false },
  ])
  const add = () => {
    todos.value = [
      ...todos.value,
      { id: nextId++, title: draft.value, done: false },
    ]
    draft.value = ''
  }
  const remove = (id: number) =>
    (todos.value = todos.value.filter((t) => t.id !== id))
  // Only the changed item gets a new object; the rest
  // keep their identity.
  const toggle = (id: number) =>
    (todos.value = todos.value.map((t) =>
      t.id === id ? { ...t, done: !t.done } : t,
    ))
  return (
    <Card title="Todos">
      <Input
        label="New todo"
        value={draft.value}
        onInput={(e) =>
          (draft.value = e.currentTarget.value)
        }
      />
      <Button
        size="sm"
        disabled={!draft.value.trim()}
        onClick={add}
      >
        Add
      </Button>
      <ul>
        {todos.value.map((t) => (
          <li key={t.id}>
            <Checkbox
              checked={t.done}
              onChange={() => toggle(t.id)}
            >
              {t.title}
            </Checkbox>
            <Button
              size="sm"
              emphasis="ghost"
              onClick={() => remove(t.id)}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
      <p>
        {todos.value.filter((t) => t.done).length} of{' '}
        {todos.value.length} done
      </p>
    </Card>
  )
}
