import { useRef, useState } from 'react'

type Task = { id: string; title: string; done: boolean }

export function Board({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState('')
  const nextId = useRef(0)
  const toggle = (id: string) => setTasks(ts => ts.map(t => (t.id === id ? { ...t, done: !t.done } : t)))
  const shown = tasks.filter(t => t.title.toLowerCase().includes(filter.toLowerCase()))

  const column = (done: boolean, label: string) => {
    const list = shown.filter(t => t.done === done)
    return (
      <section aria-label={label}>
        <h2>{label} ({list.length})</h2>
        <ul>
          {list.map(t => (
            <li key={t.id}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />{' '}
                <span data-testid="title">{t.title}</span>
              </label>
              <input aria-label={`Note for ${t.title}`} />
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <div>
      <label>Filter <input value={filter} onChange={e => setFilter(e.target.value)} /></label>
      <form onSubmit={e => {
        e.preventDefault()
        const title = draft.trim()
        if (title) setTasks(ts => [...ts, { id: `new-${nextId.current++}`, title, done: false }])
        setDraft('')
      }}>
        <label>New task <input value={draft} onChange={e => setDraft(e.target.value)} /></label>
        <button type="submit">Add</button>
      </form>
      {column(false, 'Todo')}
      {column(true, 'Done')}
    </div>
  )
}
