import { derived, onMount, state, watch } from 'kerf'

export type Todo = { id: number; text: string; done: boolean }
export type Filter = 'All' | 'Active' | 'Completed'
const load = <T>(key: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '')
  } catch {
    return d
  }
}

export function todoState() {
  const ready = state(false)
  const todos = state<Todo[]>([])
  const filter = state<Filter>('All')
  const text = state('')
  const editing = state<number | null>(null)
  const draft = state('')
  onMount(() => {
    todos.value = load('todos', [])
    filter.value = load('filter', 'All')
    ready.value = true
  })
  watch(
    () => [todos.value, filter.value, ready.value] as const,
    ([t, f, r]) => {
      if (r) {
        localStorage.setItem('todos', JSON.stringify(t))
        localStorage.setItem('filter', JSON.stringify(f))
      }
    },
  )
  const left = derived(() => todos.value.filter((t) => !t.done).length)
  const shown = derived(() =>
    todos.value.filter((t) => filter.value === 'All' || (filter.value === 'Active') === !t.done),
  )
  const save = (id: number) => {
    const v = draft.value.trim()
    todos.value = v
      ? todos.value.map((t) => (t.id === id ? { ...t, text: v } : t))
      : todos.value.filter((t) => t.id !== id)
    editing.value = null
  }
  const add = (e: Event) => {
    e.preventDefault()
    const v = text.value.trim()
    if (v) todos.value = [...todos.value, { id: Date.now() + Math.random(), text: v, done: false }]
    text.value = ''
  }
  return { todos, filter, text, editing, draft, left, shown, save, add }
}
