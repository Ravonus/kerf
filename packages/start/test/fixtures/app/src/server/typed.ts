// A schema only a type reads besides the definition: the client gets neither it nor zod (build.test.ts).
import { mutation } from '@weft-js/start'
import { z } from 'zod'

const input = z.object({ title: z.string() })
export type Input = z.infer<typeof input>
export const save = mutation({ input, run: ({ input }) => input.title })
