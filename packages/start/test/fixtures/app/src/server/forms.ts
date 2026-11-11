// The fixture's forms and uploads (research 29): every way a `<Form>` submit can end.
import { invalid, mutation, query, redirect } from '@kerf-js/start'
import { z } from '@kerf-js/start/media'

const notes: { title: string; qty: number; urgent: boolean }[] = []
let cover: unknown = null

export const listNotes = query({ tags: ['notes'], run: () => notes })
export const getCover = query({
  tags: ['cover'],
  output: z.media().nullable(),
  run: () => cover as any,
})

export const addNote = mutation({
  input: z.object({
    title: z.string().min(2, 'Title is too short'),
    qty: z.number({ error: 'Quantity must be a number' }).int(),
    urgent: z.boolean().optional(),
    password: z.string().optional(),
  }),
  invalidates: ['notes'],
  run: async ({ input, ctx }) => {
    if (input.title === 'slow') await new Promise((ok) => setTimeout(ok, 300))
    if (input.title === 'taken') invalid({ title: 'Already taken' })
    if (input.title === 'boom') throw new Error('kaboom')
    ctx.response.headers.append('set-cookie', 'noted=1; Path=/')
    if (input.title === 'elsewhere') redirect('/about')
    notes.push({ title: input.title, qty: input.qty, urgent: !!input.urgent })
    return { count: notes.length }
  },
})

export const rename = mutation({
  input: z.object({ name: z.string().min(1) }),
  run: async ({ input }) => ({ name: input.name }),
})

export const setCover = mutation({
  input: z.object({ file: z.file() }),
  invalidates: ['cover'],
  run: async ({ input, ctx }) => (cover = await ctx.media.ingest(input.file)),
})
