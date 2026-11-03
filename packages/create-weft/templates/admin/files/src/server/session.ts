import { mutation, query, redirect } from '@weft-js/start'
import { forward } from '@weft-js/start/auth'
import { z } from 'zod'
import auth from '#/auth.server'

const credentials = z.object({ email: z.email(), password: z.string().min(8) })

/** Who is signed in, or null. */
export const me = query({
  tags: ['session'],
  run: ({ ctx }) => (ctx.user ? { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email } : null),
})

export const signUp = mutation({
  input: credentials.extend({ name: z.string().trim().min(1) }),
  run: async ({ input, ctx }) => {
    await forward(ctx, auth.api.signUpEmail({ body: input, headers: ctx.request.headers, asResponse: true }))
    redirect('/admin')
  },
})

export const signIn = mutation({
  input: credentials,
  run: async ({ input, ctx }) => {
    await forward(ctx, auth.api.signInEmail({ body: input, headers: ctx.request.headers, asResponse: true }))
    redirect('/admin')
  },
})

export const signOut = mutation({
  run: async ({ ctx }) => {
    await forward(ctx, auth.api.signOut({ headers: ctx.request.headers, asResponse: true }))
    redirect('/login')
  },
})
