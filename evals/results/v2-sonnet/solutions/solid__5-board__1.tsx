import { createSignal, For } from 'solid-js'

type Task = { id: string; title: string; done: boolean }

export function Board(props: { initialTasks: Task[] }) {
  const [tasks, setTasks] = createSignal(props.initialTasks)
  const [filter, setFilter] = createSignal('')
  const [newTitle, setNewTitle] = createSignal('')
  const [notes, setNotes] = createSignal<Record<string, string>>({})
  let nextId = 0
  const visible = (done: boolean) => {
    const q = filter().toLowerCase()
    return tasks().filter(t => t.done === done && t.title.toLowerCase().includes(q))
  }
  const add = (e: Event) => {
    e.preventDefault()
    const title = newTitle().trim()
    if (!title) return
    setTasks(ts => [...ts, { id: `new-${nextId++}-${Date.now()}`, title, done: false }])
    setNewTitle('')
  }
  const toggle = (id: string) => setTasks(ts => ts.map(t => (t.id === id ? { ...t, done: !t.done } : t)))

  const column = (done: boolean, label: string) => (
    <section aria-label={label}>
      <h2>{label} ({visible(done).length})</h2>
      <ul>
        <For each={visible(done)}>
          {t => (
            <li>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />{' '}
                <span data-testid="title">{t.title}</span>
              </label>{' '}
              <input
                type="text"
                aria-label={`Note for ${t.title}`}
                value={notes()[t.id] ?? ''}
                onInput={e => {
                  const v = e.currentTarget.value
                  setNotes(n => ({ ...n, [t.id]: v }))
                }}
              />
            </li>
          )}
        </For>
      </ul>
    </section>
  )

  return (
    <div>
      <label>
        Filter <input type="text" value={filter()} onInput={e => setFilter(e.currentTarget.value)} />
      </label>
      <form onSubmit={add}>
        <label>
          New task <input type="text" value={newTitle()} onInput={e => setNewTitle(e.currentTarget.value)} />
        </label>
        <button type="submit">Add</button>
      </form>
      {column(false, 'Todo')}
      {column(true, 'Done')}
    </div>
  )
}
