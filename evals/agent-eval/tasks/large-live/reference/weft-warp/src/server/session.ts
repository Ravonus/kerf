import { mutation, redirect } from '@weft-js/start'
import { forward } from '@weft-js/start/auth'
import { z } from 'zod'
import auth from '#/auth.server'
import { requireSameOrigin } from '#/lib/origin'

const credentials = z.object({ email: z.email(), password: z.string().min(8) })
export const signUp = mutation({
  input: credentials,
  run: async ({ input, ctx }) => {
    requireSameOrigin(ctx.request)
    await forward(
      ctx,
      auth.api.signUpEmail({
        body: { ...input, name: input.email },
        headers: ctx.request.headers,
        asResponse: true,
      }),
    )
    redirect('/')
  },
})
export const signIn = mutation({
  input: credentials,
  run: async ({ input, ctx }) => {
    requireSameOrigin(ctx.request)
    await forward(
      ctx,
      auth.api.signInEmail({ body: input, headers: ctx.request.headers, asResponse: true }),
    )
    redirect('/')
  },
})
export const signOut = mutation({
  auth: 'user',
  run: async ({ ctx }) => {
    requireSameOrigin(ctx.request)
    await forward(ctx, auth.api.signOut({ headers: ctx.request.headers, asResponse: true }))
    redirect('/signin')
  },
})
