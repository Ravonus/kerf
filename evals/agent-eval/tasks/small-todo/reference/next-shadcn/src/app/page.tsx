'use client'
import { useEffect, useState } from 'react'
type Todo = { id: number; text: string; done: boolean }
type Filter = 'All' | 'Active' | 'Completed'
const load = <T,>(key: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '')
  } catch {
    return d
  }
}
export default function Page() {
  const [ready, setReady] = useState(false)
  const [todos, setTodos] = useState<Todo[]>([])
  const [filter, setFilter] = useState<Filter>('All')
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setTodos(load('todos', []))
    setFilter(load('filter', 'All'))
    setReady(true)
  }, [])
  useEffect(() => {
    if (ready) localStorage.setItem('todos', JSON.stringify(todos))
  }, [todos, ready])
  useEffect(() => {
    if (ready) localStorage.setItem('filter', JSON.stringify(filter))
  }, [filter, ready])
  const left = todos.filter((t) => !t.done).length
  const shown = todos.filter((t) => filter === 'All' || (filter === 'Active') === !t.done)
  const save = (id: number) => {
    const v = draft.trim()
    setTodos((ts) =>
      v ? ts.map((t) => (t.id === id ? { ...t, text: v } : t)) : ts.filter((t) => t.id !== id),
    )
    setEditing(null)
  }
  return (
    <main>
      <h1>Todos</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const v = text.trim()
          if (v) setTodos([...todos, { id: Date.now() + Math.random(), text: v, done: false }])
          setText('')
        }}
      >
        <input aria-label="New todo" value={text} onChange={(e) => setText(e.target.value)} />
        <button>Add</button>
      </form>
      {todos.length > 0 && (
        <label>
          <input
            type="checkbox"
            checked={left === 0}
            onChange={() => setTodos(todos.map((t) => ({ ...t, done: left > 0 })))}
          />
          Mark all as complete
        </label>
      )}
      <ul aria-label="Todos">
        {shown.map((t) => (
          <li key={t.id}>
            {editing === t.id ? (
              <input
                aria-label="Edit todo"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save(t.id)
                  if (e.key === 'Escape') setEditing(null)
                }}
              />
            ) : (
              <label>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() =>
                    setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
                  }
                />
                {t.text}
              </label>
            )}
            <button
              onClick={() => {
                setEditing(t.id)
                setDraft(t.text)
              }}
            >
              Edit {t.text}
            </button>
            <button onClick={() => setTodos(todos.filter((x) => x.id !== t.id))}>
              Delete {t.text}
            </button>
          </li>
        ))}
      </ul>
      {(['All', 'Active', 'Completed'] as Filter[]).map((f) => (
        <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
          {f}
        </button>
      ))}
      <p>
        {left} {left === 1 ? 'item' : 'items'} left
      </p>
      {todos.some((t) => t.done) && (
        <button onClick={() => setTodos(todos.filter((t) => !t.done))}>Clear completed</button>
      )}
    </main>
  )
}
