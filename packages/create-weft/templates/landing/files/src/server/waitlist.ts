import { mutation } from '@weft/start'
import { z } from 'zod'
import { waitlist } from '#/db/schema'

export const joinWaitlist = mutation({
  input: z.object({ email: z.email() }),
  run: async ({ input, ctx }) => {
    await ctx.db.insert(waitlist).values({ email: input.email }).onConflictDoNothing()
    return true
  },
})
