'use server'

import { reload } from '@solidjs/router'
import { and, count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '~/db/index.server'
import { todos } from '~/db/schema'
import type { Filter } from '~/lib/filter'
import { requireUser } from './auth.server'

const Id = z.guid()
const Title = z.string().trim().min(1).max(200)
const shown = { all: undefined, active: eq(todos.done, false), done: eq(todos.done, true) }

// The server answers each write with the rows on screen, and these are the only keys it has to send.
const answer = () => reload({ revalidate: 'todos' })

export async function loadTodos(filter: Filter) {
  const user = await requireUser()
  const mine = eq(todos.userId, user.id)
  const [rows, [left]] = await Promise.all([
    db
      .select({ id: todos.id, title: todos.title, done: todos.done })
      .from(todos)
      .where(and(mine, shown[filter]))
      .orderBy(desc(todos.createdAt), desc(todos.id)),
    db
      .select({ n: count() })
      .from(todos)
      .where(and(mine, eq(todos.done, false))),
  ])
  return { rows, left: left!.n }
}

export async function insertTodo(form: FormData | URLSearchParams) {
  const user = await requireUser()
  const title = Title.safeParse(form.get('title'))
  if (!title.success) return { error: 'A todo needs a title of up to 200 characters.' }
  // The browser names the row, so a repeated post lands on the same one. A post from before hydration has no id, and gets the default.
  const id = Id.safeParse(form.get('id'))
  await db
    .insert(todos)
    .values({ id: id.success ? id.data : undefined, userId: user.id, title: title.data })
    .onConflictDoNothing()
  return answer()
}

export async function setDone(id: string, done: boolean) {
  const user = await requireUser()
  await db
    .update(todos)
    .set({ done })
    .where(and(eq(todos.id, Id.parse(id)), eq(todos.userId, user.id)))
  return answer()
}

export async function removeTodo(form: FormData | URLSearchParams) {
  const user = await requireUser()
  await db
    .delete(todos)
    .where(and(eq(todos.id, Id.parse(form.get('id'))), eq(todos.userId, user.id)))
  return answer()
}
