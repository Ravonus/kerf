import { createSignal, For } from 'solid-js'

type Task = { id: string; title: string; done: boolean }

export function Board(props: { initialTasks: Task[] }) {
  const [tasks, setTasks] = createSignal(props.initialTasks.map((t) => ({ ...t })))
  const [filter, setFilter] = createSignal('')
  const [notes, setNotes] = createSignal<Record<string, string>>({})
  const [draft, setDraft] = createSignal('')
  let nextId = 0
  const toggle = (id: string) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  const shown = () => tasks().filter((t) => t.title.toLowerCase().includes(filter().toLowerCase()))

  const column = (done: boolean, label: string) => {
    const list = () => shown().filter((t) => t.done === done)
    return (
      <section aria-label={label}>
        <h2>
          {label} ({list().length})
        </h2>
        <ul>
          <For each={list()}>
            {(t) => (
              <li>
                <label>
                  <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />{' '}
                  <span data-testid="title">{t.title}</span>
                </label>
                <input
                  aria-label={`Note for ${t.title}`}
                  value={notes()[t.id] ?? ''}
                  onInput={(e) => setNotes((n) => ({ ...n, [t.id]: e.currentTarget.value }))}
                />
              </li>
            )}
          </For>
        </ul>
      </section>
    )
  }

  return (
    <div>
      <label>
        Filter <input value={filter()} onInput={(e) => setFilter(e.currentTarget.value)} />
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const title = draft().trim()
          if (title) setTasks((ts) => [...ts, { id: `new-${nextId++}`, title, done: false }])
          setDraft('')
        }}
      >
        <label>
          New task <input value={draft()} onInput={(e) => setDraft(e.currentTarget.value)} />
        </label>
        <button type="submit">Add</button>
      </form>
      {column(false, 'Todo')}
      {column(true, 'Done')}
    </div>
  )
}
