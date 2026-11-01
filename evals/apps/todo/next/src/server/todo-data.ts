import 'server-only'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { todos } from '@/db/schema'

export type Filter = 'all' | 'active' | 'done'
export type Todo = { id: string; title: string; done: boolean }

const narrow: Record<Filter, SQL | undefined> = { all: undefined, active: eq(todos.done, false), done: eq(todos.done, true) }

// Rows are per user and change from anywhere, so they're read on every request rather than cached.
export async function loadTodos(userId: string, filter: Filter) {
  const mine = eq(todos.userId, userId)
  const [rows, left] = await Promise.all([
    db.select({ id: todos.id, title: todos.title, done: todos.done }).from(todos).where(and(mine, narrow[filter])).orderBy(desc(todos.createdAt), desc(todos.id)),
    db.$count(todos, and(mine, eq(todos.done, false))),
  ])
  return { rows, left }
}
