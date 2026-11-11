import { mutation, query, type OptimisticCache } from '@kerf-js/start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'
import { viewNames, type View } from '#/lib/views'

const byId = z.object({ id: z.guid() })
const shown = { all: undefined, active: eq(todos.done, false), done: eq(todos.done, true) }

type List = { rows: { id: string; title: string; done: boolean }[]; left: number }

// Rows are per user and change from anywhere, so each view reads what it shows, with the count every view needs.
export const listTodos = query({
  input: z.object({ view: z.enum(viewNames) }),
  tags: ['todos'],
  auth: 'user',
  run: async ({ input, ctx }): Promise<List> => {
    const mine = eq(todos.userId, ctx.user.id)
    const [rows, left] = await Promise.all([
      ctx.db
        .select({ id: todos.id, title: todos.title, done: todos.done })
        .from(todos)
        .where(and(mine, shown[input.view]))
        .orderBy(desc(todos.createdAt), desc(todos.id)),
      ctx.db.$count(todos, and(mine, eq(todos.done, false))),
    ])
    return { rows, left }
  },
})

/** A change to the views already in the cache: only those are drawn, and any of them can come back into sight. */
function inViews(cache: OptimisticCache, change: (list: List, view: View) => void) {
  for (const view of viewNames)
    if (cache.get(listTodos, { view }))
      cache.update(listTodos, { view }, (list) => change(list, view))
}

// The client picks the id, so the row it draws is the row that lands, and sending the same add again can't make a second one.
export const addTodo = mutation({
  input: byId.extend({
    title: z
      .string()
      .trim()
      .min(1, 'Write something first.')
      .max(200, 'Keep it under 200 characters.'),
  }),
  auth: 'user',
  invalidates: ['todos'],
  optimistic: ({ input }, cache) =>
    inViews(cache, (list, view) => {
      list.left++
      if (view !== 'done')
        list.rows.unshift({ id: input.id, title: input.title.trim(), done: false })
    }),
  run: async ({ input, ctx }) => {
    await ctx.db
      .insert(todos)
      .values({ ...input, userId: ctx.user.id })
      .onConflictDoNothing()
  },
})

// `done` is the state asked for, not a flip: a repeated or reordered request still ends where the last click left it.
export const toggleTodo = mutation({
  input: byId.extend({ done: z.boolean() }),
  auth: 'user',
  invalidates: ['todos'],
  optimistic: ({ input }, cache) =>
    inViews(cache, (list, view) => {
      const row = list.rows.find((t) => t.id === input.id)
      if (!row || row.done === input.done) return
      list.left += input.done ? -1 : 1
      if (view === 'all') row.done = input.done
      else list.rows.splice(list.rows.indexOf(row), 1)
    }),
  run: async ({ input, ctx }) => {
    await ctx.db
      .update(todos)
      .set({ done: input.done })
      .where(and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id)))
  },
})

export const deleteTodo = mutation({
  input: byId,
  auth: 'user',
  invalidates: ['todos'],
  optimistic: ({ input }, cache) =>
    inViews(cache, (list) => {
      const row = list.rows.find((t) => t.id === input.id)
      if (!row) return
      if (!row.done) list.left--
      list.rows.splice(list.rows.indexOf(row), 1)
    }),
  run: async ({ input, ctx }) => {
    await ctx.db.delete(todos).where(and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id)))
  },
})
