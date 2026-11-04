// The scaffold's sign-in mutations on the hand-written provider: the same inputs, and `forward` for its cookies.
import { mutation, query, redirect } from '@weft-js/start'
import { forward } from '@weft-js/start/auth'
import { z } from 'zod'
import auth from '#/auth.server'

const credentials = z.object({ email: z.email(), password: z.string().min(8) })
const call = (request: Request, path: string, body: unknown = {}) =>
  auth.handler(
    new Request(new URL(`/api/auth${path}`, request.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: request.headers.get('cookie') ?? '' },
      body: JSON.stringify(body),
    }),
  )

/** Who is signed in, or null. */
export const me = query({
  tags: ['session'],
  run: ({ ctx }) =>
    ctx.user ? { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email } : null,
})

export const signUp = mutation({
  input: credentials.extend({ name: z.string().trim().min(1) }),
  run: async ({ input, ctx }) => {
    await forward(ctx, call(ctx.request, '/sign-up', input))
    redirect('/todos')
  },
})

export const signIn = mutation({
  input: credentials,
  run: async ({ input, ctx }) => {
    await forward(ctx, call(ctx.request, '/sign-in', input))
    redirect('/todos')
  },
})

export const signOut = mutation({
  run: async ({ ctx }) => {
    await forward(ctx, call(ctx.request, '/sign-out'))
    redirect('/login')
  },
})
