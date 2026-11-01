'use server'

import { and, eq } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db'
import { todos } from '@/db/schema'
import { currentUser } from './auth'

const id = z.guid()
const title = z.string().trim().min(1).max(200)

// The client picks the id, so a retried or doubled submit lands once.
export async function addTodo(rawId: string, rawTitle: string) {
  const user = await currentUser()
  await db.insert(todos).values({ id: id.parse(rawId), userId: user.id, title: title.parse(rawTitle) }).onConflictDoNothing()
  refresh()
}

export async function setDone(rawId: string, done: boolean) {
  const user = await currentUser()
  await db.update(todos).set({ done: z.boolean().parse(done) }).where(and(eq(todos.id, id.parse(rawId)), eq(todos.userId, user.id)))
  refresh()
}

export async function deleteTodo(rawId: string) {
  const user = await currentUser()
  await db.delete(todos).where(and(eq(todos.id, id.parse(rawId)), eq(todos.userId, user.id)))
  refresh()
}
