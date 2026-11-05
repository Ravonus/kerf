import { state } from '@weft-js/core'
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
} from '@weft-js/warp'

type Todo = {
  id: string
  title: string
  saving?: boolean
}

// Stands in for a mutation's round trip: the server
// answers after 900 ms, and refuses any title with "fail"
// in it.
// The ids it hands out count up, as a database's would.
let saved = 1
const save = (title: string) =>
  new Promise<Todo>((done, fail) => {
    setTimeout(
      () =>
        title.includes('fail')
          ? fail(
              new Error(`The server refused "${title}".`),
            )
          : done({ id: String(++saved), title }),
      900,
    )
  })

export default function Todos() {
  const todos = state<Todo[]>([
    { id: '1', title: 'Grind the beans' },
  ])
  const title = state('')
  const problem = state('')
  let n = 0
  const add = async () => {
    const text = title.value.trim()
    if (!text) return
    const temp = `tmp:${++n}`
    // The optimistic layer: the row shows at once, marked
    // as saving.
    todos.value = [
      ...todos.value,
      { id: temp, title: text, saving: true },
    ]
    title.value = ''
    problem.value = ''
    try {
      const row = await save(text)
      todos.value = todos.value.map((t) =>
        t.id === temp ? row : t,
      )
    } catch (err) {
      // The server said no: the layer goes, and the list
      // is what the server has.
      todos.value = todos.value.filter(
        (t) => t.id !== temp,
      )
      problem.value =
        err instanceof Error ? err.message : String(err)
    }
  }
  const submit = (e: Event) => {
    e.preventDefault()
    void add()
  }
  return (
    <Card title="Todos">
      <ul>
        {todos.value.map((t) => (
          <li key={t.id}>
            {t.title}{' '}
            {t.saving && (
              <Badge tone="info">saving</Badge>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={submit}>
        <Input
          label="New todo"
          value={title.value}
          onInput={(e) =>
            (title.value = e.currentTarget.value)
          }
        />
        <Button type="submit">Add</Button>
      </form>
      {problem.value && (
        <Alert
          tone="critical"
          live
        >
          {problem.value}
        </Alert>
      )}
    </Card>
  )
}
