import { eq } from 'drizzle-orm'
import { mutation, query, type StandardSchemaV1 } from '@kerf-js/start'
import { db } from '../db'
import { notes } from '../schema'

const body: StandardSchemaV1<{ body: string }> = {
  '~standard': {
    version: 1,
    vendor: 'fixture',
    validate: (v) => ({ value: v as { body: string } }),
  },
}

/** Yours, and only yours: the poke says "notes", and this is what decides what you see. */
export const myNotes = query({
  auth: 'user',
  tags: ['notes'],
  live: { required: true, verify: { target: 'staging', row: { owner: 'alice' } } },
  run: ({ ctx }) =>
    db.select().from(notes).where(eq(notes.owner, ctx.user.id)).orderBy(notes.id) as Promise<
      { id: number; owner: string; body: string }[]
    >,
})

export const addNote = mutation({
  auth: 'user',
  input: body,
  invalidates: ['notes'],
  run: async ({ input, ctx }) => {
    await db.insert(notes).values({ owner: ctx.user.id, body: input.body })
  },
})
