import { useState } from 'react'
import type { FormEvent } from 'react'

type Task = { id: string; title: string; done: boolean }

export function Board({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [nextId, setNextId] = useState(1)

  const toggle = (id: string) => setTasks(ts => ts.map(t => (t.id === id ? { ...t, done: !t.done } : t)))

  const add = (e: FormEvent) => {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setTasks(ts => [...ts, { id: `new-${nextId}`, title, done: false }])
    setNextId(n => n + 1)
    setNewTitle('')
  }

  const q = filter.toLowerCase()
  const visible = tasks.filter(t => t.title.toLowerCase().includes(q))

  const column = (done: boolean, label: string) => {
    const items = visible.filter(t => t.done === done)
    return (
      <section aria-label={label}>
        <h2>{`${label} (${items.length})`}</h2>
        <ul>
          {items.map(t => (
            <li key={t.id}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />{' '}
                <span data-testid="title">{t.title}</span>
              </label>{' '}
              <input
                type="text"
                aria-label={`Note for ${t.title}`}
                value={notes[t.id] ?? ''}
                onChange={e => setNotes(n => ({ ...n, [t.id]: e.target.value }))}
              />
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <div>
      <label>
        Filter <input type="text" value={filter} onChange={e => setFilter(e.target.value)} />
      </label>
      <form onSubmit={add}>
        <label>
          New task <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
        </label>
        <button type="submit">Add</button>
      </form>
      {column(false, 'Todo')}
      {column(true, 'Done')}
    </div>
  )
}
