import { query, raise } from '@weft-js/start/data'
import { z } from 'zod'
import { thumbnail as make } from './image'

const Thumb = z.object({ seed: z.int().min(0).max(1_000_000), width: z.int().min(64).max(4096).default(1600), height: z.int().min(64).max(4096).default(1200), passes: z.int().min(1).max(16).default(4), factor: z.int().min(1).max(32).default(8) })
const Done = z.object({ checksum: z.string(), mean: z.array(z.int()), thumb: z.array(z.int()) })

export const thumbnail = query({ input: Thumb, output: Done, run: ({ input }) => make(input.seed, input.width, input.height, input.passes, input.factor) })

export const guarded = query({
  input: z.object({ width: z.int().min(1).max(100_000), height: z.int().min(1).max(100_000) }),
  output: z.object({ pixels: z.int() }),
  errors: { TooLarge: z.object({ pixels: z.int() }) },
  run: ({ input }) => {
    const pixels = input.width * input.height
    if (pixels > 100_000_000) raise('TooLarge', { pixels })
    return { pixels }
  },
})

export const stats = query({ output: z.object({ images: z.int() }), tags: ['images'], cache: { life: 'seconds' }, run: () => ({ images: 3 }) })

// Only the Rust has anything to show for these: they're here so both builds export the same functions.
export const boom = query({ output: z.null(), run: () => null })
export const spin = query({ output: z.null(), run: () => null })
