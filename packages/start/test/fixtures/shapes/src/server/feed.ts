// A 20-row feed at research 11 §7.6's lengths, the same for the same seed. `v` only changes the cache key: new args
// with the same payload, which is what last-seen shapes are for.
import { query } from '@kerf-js/start'
import { z } from 'zod'

const WORDS =
  'the quick brown fox jumps over a lazy dog while seven wizards mix strong drinks for every thin man in town'.split(
    ' ',
  )

function words(seed: number, n: number) {
  let out = '',
    x = seed
  while (out.length < n) {
    x = (x * 1103515245 + 12345) % 2147483648
    out += (out ? ' ' : '') + WORDS[x % WORDS.length]
  }
  return out.slice(0, n)
}

export const listPosts = query({
  input: z.object({ limit: z.number(), seed: z.number(), v: z.number() }),
  output: z.array(
    z.object({
      id: z.number(),
      title: z.string().min(12).max(70),
      body: z.string().min(40).max(360),
    }),
  ),
  run: async ({ input }) => {
    // A streamed page's slow query: well after hydration even on a loaded machine, so the swap isn't counted as a write.
    if (input.v === 9) await new Promise((ok) => setTimeout(ok, 1500))
    return posts(input)
  },
})

const posts = (input: { limit: number; seed: number }) =>
  Array.from({ length: input.limit }, (_, i) => {
    const s = input.seed * 1000 + i
    return {
      id: i,
      title: words(s, 12 + ((s * 7) % 59)),
      body: words(s + 1, 40 + ((s * 13) % 321)),
    }
  })
