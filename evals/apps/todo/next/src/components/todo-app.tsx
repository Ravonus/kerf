'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { memo, startTransition, useCallback, useEffect, useOptimistic, useRef, useState } from 'react'
import { addTodo, deleteTodo, setDone } from '@/server/todos'
import type { Filter, Todo } from '@/server/todo-data'

type List = { todos: Todo[]; left: number }
type Change = { type: 'add'; todo: Todo } | { type: 'set'; id: string; done: boolean } | { type: 'delete'; id: string }

const links: { filter: Filter; label: string; href: string }[] = [
  { filter: 'all', label: 'All', href: '/todos' },
  { filter: 'active', label: 'Active', href: '/todos?filter=active' },
  { filter: 'done', label: 'Done', href: '/todos?filter=done' },
]

function applyChange({ todos, left }: List, change: Change, filter: Filter): List {
  const shows = (done: boolean) => filter === 'all' || done === (filter === 'done')
  if (change.type === 'add') return { todos: shows(false) ? [...todos, change.todo] : todos, left: left + 1 }
  if (change.type === 'delete') {
    const gone = todos.find(t => t.id === change.id)
    return { todos: todos.filter(t => t.id !== change.id), left: gone && !gone.done ? left - 1 : left }
  }
  const before = todos.find(t => t.id === change.id)
  if (!before || before.done === change.done) return { todos, left }
  return {
    todos: shows(change.done) ? todos.map(t => (t === before ? { ...t, done: change.done } : t)) : todos.filter(t => t !== before),
    left: left + (change.done ? -1 : 1),
  }
}

/** Another tab, or another device, may have changed the list while this one was in the background. */
function useRefreshOnReturn() {
  const router = useRouter()
  useEffect(() => {
    let last = 0
    const check = () => {
      if (document.hidden || performance.now() - last < 250) return
      last = performance.now()
      router.refresh()
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [router])
}

export function TodoApp({ todos, left, filter }: List & { filter: Filter }) {
  const [list, change] = useOptimistic<List, Change>({ todos, left }, (state, next) => applyChange(state, next, filter))
  const [problem, setProblem] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useRefreshOnReturn()

  // Every failed write ends here: the transition ending rolls the optimistic change back, and this says so.
  const run = useCallback((next: Change, write: () => Promise<void>, failure: string) => {
    startTransition(async () => {
      setProblem('')
      change(next)
      try {
        await write()
      } catch (e) {
        console.error(e)
        setProblem(failure)
      }
    })
  }, [change])

  const toggle = useCallback((id: string, title: string, done: boolean) => {
    run({ type: 'set', id, done }, () => setDone(id, done), `"${title}" wasn't saved. Please try again.`)
  }, [run])

  const remove = useCallback((id: string, title: string) => {
    run({ type: 'delete', id }, () => deleteTodo(id), `"${title}" wasn't deleted. Please try again.`)
  }, [run])

  function add(form: FormData) {
    const title = String(form.get('title')).trim()
    if (!title) return
    const id = crypto.randomUUID()
    // Cleared now, not when the action ends: the field is required, so a second click submits nothing.
    if (input.current) input.current.value = ''
    run({ type: 'add', todo: { id, title, done: false } }, () => addTodo(id, title), `"${title}" wasn't added. Please try again.`)
  }

  return (
    <>
      <form action={add} className="mt-6 flex gap-2">
        <input
          ref={input}
          name="title"
          aria-label="New todo"
          placeholder="What needs doing?"
          required
          maxLength={200}
          autoComplete="off"
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-raised px-4 text-base outline-none transition-colors placeholder:text-faint focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/25"
        />
        <button type="submit" className="h-12 cursor-pointer rounded-xl bg-accent px-6 font-semibold text-on-accent transition-colors hover:bg-accent-strong focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Add
        </button>
      </form>

      <p role="alert" className="mt-2 min-h-5 text-sm font-medium text-danger">{problem}</p>

      <div className="mt-1 flex items-center justify-between gap-4">
        <nav aria-label="Filter" className="flex gap-1 text-sm font-medium">
          {links.map(link => (
            <Link
              key={link.filter}
              href={link.href}
              aria-current={link.filter === filter ? 'page' : undefined}
              className="rounded-lg px-3 py-2 text-muted transition-colors hover:text-ink aria-[current=page]:bg-tint aria-[current=page]:text-accent-strong"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p role="status" className="text-sm text-muted tabular-nums">{list.left} left</p>
      </div>

      <ul role="list" aria-label="Todos" className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-raised empty:hidden">
        {list.todos.map(todo => <Row key={todo.id} id={todo.id} title={todo.title} done={todo.done} onToggle={toggle} onDelete={remove} />)}
      </ul>
      {list.todos.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-muted">
          {filter === 'done' ? 'Nothing finished yet.' : filter === 'active' ? 'All done.' : 'Nothing here yet. Add your first todo above.'}
        </p>
      )}
    </>
  )
}

type RowProps = Todo & {
  onToggle: (id: string, title: string, done: boolean) => void
  onDelete: (id: string, title: string) => void
}

const Row = memo(function Row({ id, title, done, onToggle, onDelete }: RowProps) {
  return (
    <li className="flex items-center gap-2 pr-2">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pl-4">
        <input
          type="checkbox"
          checked={done}
          onChange={e => onToggle(id, title, e.target.checked)}
          className="tick size-5 shrink-0 cursor-pointer rounded-md border border-faint transition-colors checked:border-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <span className={done ? 'min-w-0 break-words text-faint line-through' : 'min-w-0 break-words'}>{title}</span>
      </label>
      <button
        type="button"
        aria-label={`Delete ${title}`}
        onClick={() => onDelete(id, title)}
        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-faint transition-colors hover:bg-tint hover:text-danger focus-visible:outline-3 focus-visible:outline-accent"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-none stroke-current stroke-[1.75]" strokeLinecap="round">
          <path d="m4 4 8 8M12 4l-8 8" />
        </svg>
      </button>
    </li>
  )
})
