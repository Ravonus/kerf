import { FnError, mutation, query } from '@weft-js/start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { messages } from '#/db/schema'
import { requireSameOrigin } from '#/lib/origin'

export const listMessages = query({
  tags: ['messages'],
  auth: 'user',
  run: ({ ctx }) =>
    ctx.db.select().from(messages).orderBy(desc(messages.createdAt), desc(messages.id)),
})
export const postMessage = mutation({
  input: z.object({
    id: z.guid(),
    text: z.string().trim().min(1, 'Write a message').max(280, 'Too long'),
  }),
  auth: 'user',
  invalidates: ['messages'],
  run: async ({ input, ctx }) => {
    requireSameOrigin(ctx.request)
    await ctx.db.insert(messages).values({
      ...input,
      authorId: ctx.user.id,
      authorEmail: ctx.user.email,
      createdAt: Date.now(),
    })
  },
})
export const deleteMessage = mutation({
  input: z.object({ id: z.guid() }),
  auth: 'user',
  invalidates: ['messages'],
  run: async ({ input, ctx }) => {
    requireSameOrigin(ctx.request)
    const deleted = await ctx.db
      .delete(messages)
      .where(and(eq(messages.id, input.id), eq(messages.authorId, ctx.user.id)))
      .returning()
    if (!deleted.length) throw new FnError({ message: 'Message not found' }, 404)
  },
})
