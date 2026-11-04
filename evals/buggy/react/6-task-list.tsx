import { useRef, useState } from 'react'

type Task = { id: string; title: string }

export function TaskList({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [draft, setDraft] = useState('')
  const nextId = useRef(0)
  const move = (i: number, d: number) =>
    setTasks((ts) => {
      const j = i + d
      if (j < 0 || j >= ts.length) return ts
      const out = [...ts]
      ;[out[i], out[j]] = [out[j], out[i]]
      return out
    })
  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const title = draft.trim()
    if (!title) return
    setTasks((ts) => [...ts, { id: `new-${nextId.current++}`, title }])
    setDraft('')
  }
  return (
    <div>
      <ul aria-label="Tasks">
        {tasks.map((t, i) => (
          <li key={i}>
            <span data-testid="title">{t.title}</span>
            <input aria-label={`Note for ${t.title}`} />
            <button aria-label={`Move up ${t.title}`} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button aria-label={`Move down ${t.title}`} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button
              aria-label={`Remove ${t.title}`}
              onClick={() => setTasks((ts) => ts.filter((x) => x.id !== t.id))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add}>
        <input aria-label="New task" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit">Add</button>
      </form>
      <button
        onClick={() => setTasks((ts) => [...ts].sort((a, b) => a.title.localeCompare(b.title)))}
      >
        Sort A-Z
      </button>
      <p data-testid="count">{tasks.length === 1 ? '1 task' : `${tasks.length} tasks`}</p>
    </div>
  )
}
