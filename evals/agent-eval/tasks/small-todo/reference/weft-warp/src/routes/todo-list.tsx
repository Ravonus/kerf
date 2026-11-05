import type { todoState } from './todo-state'

export function todoList({ todos, editing, draft, shown, save }: ReturnType<typeof todoState>) {
  let field: HTMLInputElement | undefined
  return (
    <ul aria-label="Todos">
      {shown.value.map((t) => (
        <li key={t.id}>
          {editing.value === t.id ? (
            <input
              aria-label="Edit todo"
              autofocus
              ref={(el) => {
                field = el
                queueMicrotask(() => field?.focus())
              }}
              value={draft.value}
              onInput={(e) => {
                draft.value = e.currentTarget.value
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save(t.id)
                if (e.key === 'Escape') editing.value = null
              }}
            />
          ) : (
            <label>
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => {
                  todos.value = todos.value.map((x) =>
                    x.id === t.id ? { ...x, done: !x.done } : x,
                  )
                }}
              />
              {t.text}
            </label>
          )}
          <button
            onClick={() => {
              draft.value = t.text
              editing.value = t.id
            }}
          >
            Edit {t.text}
          </button>
          <button
            onClick={() => {
              todos.value = todos.value.filter((x) => x.id !== t.id)
            }}
          >
            Delete {t.text}
          </button>
        </li>
      ))}
    </ul>
  )
}
