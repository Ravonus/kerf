import { derived, onMount, state, watch } from 'weft'

type Todo = { id: number; text: string; done: boolean }
type Filter = 'All' | 'Active' | 'Completed'
const load = <T,>(key: string, d: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? '') } catch { return d } }

export default function Home() {
  const ready = state(false)
  const todos = state<Todo[]>([])
  const filter = state<Filter>('All')
  const text = state('')
  const editing = state<number | null>(null)
  const draft = state('')
  let field: HTMLInputElement | undefined
  onMount(() => { todos.value = load('todos', []); filter.value = load('filter', 'All'); ready.value = true })
  watch(() => [todos.value, filter.value, ready.value] as const, ([t, f, r]) => {
    if (r) { localStorage.setItem('todos', JSON.stringify(t)); localStorage.setItem('filter', JSON.stringify(f)) }
  })
  const left = derived(() => todos.value.filter(t => !t.done).length)
  const shown = derived(() => todos.value.filter(t => filter.value === 'All' || (filter.value === 'Active') === !t.done))
  const save = (id: number) => {
    const v = draft.value.trim()
    todos.value = v ? todos.value.map(t => (t.id === id ? { ...t, text: v } : t)) : todos.value.filter(t => t.id !== id)
    editing.value = null
  }
  const add = (e: Event) => {
    e.preventDefault()
    const v = text.value.trim()
    if (v) todos.value = [...todos.value, { id: Date.now() + Math.random(), text: v, done: false }]
    text.value = ''
  }
  return (
    <main>
      <h1>Todos</h1>
      <form onSubmit={add}>
        <input aria-label="New todo" value={text.value} onInput={e => { text.value = e.currentTarget.value }} />
        <button>Add</button>
      </form>
      {todos.value.length > 0 && (
        <label><input type="checkbox" checked={left.value === 0} onChange={() => { const done = left.value > 0; todos.value = todos.value.map(t => (t.done === done ? t : { ...t, done })) }} />Mark all as complete</label>
      )}
      <ul aria-label="Todos">
        {shown.value.map(t => (
          <li key={t.id}>
            {editing.value === t.id
              ? <input aria-label="Edit todo" autofocus ref={el => { field = el; queueMicrotask(() => field?.focus()) }} value={draft.value} onInput={e => { draft.value = e.currentTarget.value }} onKeyDown={e => { if (e.key === 'Enter') save(t.id); if (e.key === 'Escape') editing.value = null }} />
              : <label><input type="checkbox" checked={t.done} onChange={() => { todos.value = todos.value.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)) }} />{t.text}</label>}
            <button onClick={() => { draft.value = t.text; editing.value = t.id }}>Edit {t.text}</button>
            <button onClick={() => { todos.value = todos.value.filter(x => x.id !== t.id) }}>Delete {t.text}</button>
          </li>
        ))}
      </ul>
      {(['All', 'Active', 'Completed'] as Filter[]).map(f => <button aria-pressed={filter.value === f} onClick={() => { filter.value = f }}>{f}</button>)}
      <p>{left.value} {left.value === 1 ? 'item' : 'items'} left</p>
      {todos.value.some(t => t.done) && <button onClick={() => { todos.value = todos.value.filter(t => !t.done) }}>Clear completed</button>}
    </main>
  )
}
