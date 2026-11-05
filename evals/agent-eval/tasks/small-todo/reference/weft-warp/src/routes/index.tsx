import { todoState } from './todo-state'
import type { Filter } from './todo-state'
import { todoList } from './todo-list'

export default function Home() {
  const model = todoState()
  const { todos, filter, text, left, add } = model
  return (
    <main>
      <h1>Todos</h1>
      <form onSubmit={add}>
        <input
          aria-label="New todo"
          value={text.value}
          onInput={(e) => {
            text.value = e.currentTarget.value
          }}
        />
        <button>Add</button>
      </form>
      {todos.value.length > 0 && (
        <label>
          <input
            type="checkbox"
            checked={left.value === 0}
            onChange={() => {
              const done = left.value > 0
              todos.value = todos.value.map((t) => (t.done === done ? t : { ...t, done }))
            }}
          />
          Mark all as complete
        </label>
      )}
      {todoList(model)}
      {(['All', 'Active', 'Completed'] as Filter[]).map((f) => (
        <button
          aria-pressed={filter.value === f}
          onClick={() => {
            filter.value = f
          }}
        >
          {f}
        </button>
      ))}
      <p>
        {left.value} {left.value === 1 ? 'item' : 'items'} left
      </p>
      {todos.value.some((t) => t.done) && (
        <button
          onClick={() => {
            todos.value = todos.value.filter((t) => !t.done)
          }}
        >
          Clear completed
        </button>
      )}
    </main>
  )
}
