import { query } from '@weft-js/start/data'
import { z } from 'zod'
import { impatient, media } from './rust'

const Thumb = z.object({
  seed: z.int().min(0).max(1_000_000),
  width: z.int().min(64).max(4096).default(1600),
  height: z.int().min(64).max(4096).default(1200),
  passes: z.int().min(1).max(16).default(4),
  factor: z.int().min(1).max(32).default(8),
})
const Done = z.object({ checksum: z.string(), mean: z.array(z.int()), thumb: z.array(z.int()) })

export const thumbnail = query({ input: Thumb, output: Done, impl: media })

export const guarded = query({
  input: z.object({ width: z.int().min(1).max(100_000), height: z.int().min(1).max(100_000) }),
  output: z.object({ pixels: z.int() }),
  errors: { TooLarge: z.object({ pixels: z.int() }) },
  impl: media,
})

export const stats = query({
  output: z.object({ images: z.int() }),
  tags: ['images'],
  cache: { life: 'seconds' },
  impl: media,
})

export const boom = query({ output: z.null(), impl: media })
export const spin = query({ output: z.null(), impl: impatient })
