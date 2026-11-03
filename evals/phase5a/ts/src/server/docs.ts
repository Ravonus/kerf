// Before the swap: the search runs in TypeScript. evals/phase5a/rust has the same file after it.
import { mutation, query, raise } from '@weft-js/start'
import { z } from 'zod'
import { all, index, rank } from './rank'

export const Search = z.object({ q: z.string().trim().min(1).max(200), limit: z.int().min(1).max(50).default(10) })
export const Hit = z.object({ id: z.string(), title: z.string(), score: z.number() })

export const searchDocs = query({
  input: Search,
  output: z.array(Hit),
  tags: ['docs'],
  run: ({ input }) => rank(input.q, input.limit),
})

export const popular = query({
  input: z.object({ limit: z.int().min(1).max(10) }),
  output: z.array(z.object({ id: z.string(), title: z.string() })),
  tags: ['docs'],
  cache: { life: 'minutes' },
  run: ({ input }) => all().slice(0, input.limit).map(({ id, title }) => ({ id, title })),
})

export const getDoc = query({
  input: z.object({ id: z.string().max(64) }),
  output: z.object({ id: z.string(), title: z.string(), body: z.string() }),
  errors: { NotFound: z.object({ id: z.string() }) },
  tags: ['docs'],
  run: ({ input }) => all().find(d => d.id === input.id) ?? raise('NotFound', { id: input.id }),
})

export const addDoc = mutation({
  input: z.object({ title: z.string().min(1).max(200), body: z.string().max(10_000) }),
  output: z.object({ id: z.string() }),
  invalidates: ['docs'],
  run: ({ input }) => index({ id: `added-${all().length}`, title: input.title, body: input.body }),
})
