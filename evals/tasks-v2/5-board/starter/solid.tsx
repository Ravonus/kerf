import { createSignal, For } from 'solid-js'

type Task = { id: string; title: string; done: boolean }

export function Board(props: { initialTasks: Task[] }) {
  const [tasks, setTasks] = createSignal(props.initialTasks)
  const toggle = (id: string) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))

  const column = (done: boolean, label: string) => (
    <section aria-label={label}>
      <h2>{label}</h2>
      <ul>
        <For each={tasks().filter((t) => t.done === done)}>
          {(t) => (
            <li>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />{' '}
                <span data-testid="title">{t.title}</span>
              </label>
            </li>
          )}
        </For>
      </ul>
    </section>
  )

  return (
    <div>
      {column(false, 'Todo')}
      {column(true, 'Done')}
    </div>
  )
}
