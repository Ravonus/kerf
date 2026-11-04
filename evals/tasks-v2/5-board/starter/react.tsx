import { useState } from 'react'

type Task = { id: string; title: string; done: boolean }

export function Board({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const toggle = (id: string) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))

  const column = (done: boolean, label: string) => (
    <section aria-label={label}>
      <h2>{label}</h2>
      <ul>
        {tasks
          .filter((t) => t.done === done)
          .map((t) => (
            <li key={t.id}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />{' '}
                <span data-testid="title">{t.title}</span>
              </label>
            </li>
          ))}
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
