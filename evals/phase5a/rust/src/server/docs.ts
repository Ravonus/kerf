// After the swap: every `run` became `impl: search`, and `rank.ts` went. Nothing else changed.
import { mutation, query } from '@kerf-js/start'
import { z } from 'zod'
import { search } from './rust'

export const Search = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.int().min(1).max(50).default(10),
})
export const Hit = z.object({ id: z.string(), title: z.string(), score: z.number() })

export const searchDocs = query({
  input: Search,
  output: z.array(Hit),
  tags: ['docs'],
  impl: search,
})

export const popular = query({
  input: z.object({ limit: z.int().min(1).max(10) }),
  output: z.array(z.object({ id: z.string(), title: z.string() })),
  tags: ['docs'],
  cache: { life: 'minutes' },
  impl: search,
})

export const getDoc = query({
  input: z.object({ id: z.string().max(64) }),
  output: z.object({ id: z.string(), title: z.string(), body: z.string() }),
  errors: { NotFound: z.object({ id: z.string() }) },
  tags: ['docs'],
  impl: search,
})

export const addDoc = mutation({
  input: z.object({ title: z.string().min(1).max(200), body: z.string().max(10_000) }),
  output: z.object({ id: z.string() }),
  invalidates: ['docs'],
  impl: search,
})
