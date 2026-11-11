import type { LoadArgs, Meta } from '@kerf/start'
import { addTodo, listTodos, toggleTodo } from '../server/todos'

// `load` awaits the query for `meta` (the request cache shares that run with the component's `listTodos()`).
export const load = async (_: LoadArgs) => ({ count: (await listTodos.fetch()).length })

export const meta: Meta<typeof load> = ({ data }) => ({ title: `Todos (${data.count})` })

export default function Todos() {
  const todos = listTodos()
  return (
    <main>
      <h1>Todos</h1>
      <ul class="todos">
        {(todos.value ?? []).map((t) => (
          <li key={t.id} class={t.done ? 'done' : 'open'}>
            <button class="toggle" onClick={() => toggleTodo({ id: t.id })}>
              {t.title}
            </button>
          </li>
        ))}
      </ul>
      <button
        class="add"
        onClick={() => addTodo({ title: 'New' }).catch(() => {})}
        disabled={addTodo.pending.value}
      >
        Add
      </button>
      <button class="add-fail" onClick={() => addTodo({ title: 'fail' }).catch(() => {})}>
        Add failing
      </button>
    </main>
  )
}
