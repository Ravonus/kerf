import { mutation, query } from '@weft/start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'

const byId = z.object({ id: z.guid() })

export const listTodos = query({
  tags: ['todos'],
  auth: 'user',
  run: ({ ctx }) =>
    ctx.db.select({ id: todos.id, title: todos.title, done: todos.done }).from(todos)
      .where(eq(todos.userId, ctx.user.id))
      .orderBy(desc(todos.createdAt), desc(todos.id)),
})

// The client picks the id, so the row it draws is the row that lands, and sending the same add again can't make a second one.
export const addTodo = mutation({
  input: byId.extend({ title: z.string().trim().min(1, 'Write something first.').max(200, 'Keep it under 200 characters.') }),
  auth: 'user',
  invalidates: ['todos'],
  optimistic: ({ input }, cache) => cache.update(listTodos, undefined, list => void list.unshift({ id: input.id, title: input.title.trim(), done: false })),
  run: async ({ input, ctx }) => {
    await ctx.db.insert(todos).values({ ...input, userId: ctx.user.id }).onConflictDoNothing()
  },
})

// `done` is the state asked for, not a flip: a repeated or reordered request still ends where the last click left it.
export const toggleTodo = mutation({
  input: byId.extend({ done: z.boolean() }),
  auth: 'user',
  invalidates: ['todos'],
  optimistic: ({ input }, cache) =>
    cache.update(listTodos, undefined, list => {
      const todo = list.find(t => t.id === input.id)
      if (todo) todo.done = input.done
    }),
  run: async ({ input, ctx }) => {
    await ctx.db.update(todos).set({ done: input.done }).where(and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id)))
  },
})

export const deleteTodo = mutation({
  input: byId,
  auth: 'user',
  invalidates: ['todos'],
  optimistic: ({ input }, cache) => cache.update(listTodos, undefined, list => list.filter(t => t.id !== input.id)),
  run: async ({ input, ctx }) => {
    await ctx.db.delete(todos).where(and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id)))
  },
})
