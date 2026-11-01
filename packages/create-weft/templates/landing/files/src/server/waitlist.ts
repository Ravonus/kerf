import { mutation, redirect } from '@weft/start'
import { z } from 'zod'
import { waitlist } from '#/db/schema'

// Joining twice looks the same as joining once, so the form can't be used to find out who's on the list.
// The redirect is what makes this work with JavaScript off: a plain POST lands on the confirmation page too.
export const joinWaitlist = mutation({
  input: z.object({ email: z.email('That doesn\'t look like an email address.') }),
  run: async ({ input, ctx }) => {
    await ctx.db.insert(waitlist).values({ email: input.email.toLowerCase() }).onConflictDoNothing()
    redirect('/joined', 303)
  },
})
