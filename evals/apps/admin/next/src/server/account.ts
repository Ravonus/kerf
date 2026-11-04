'use server'

import { isAPIError } from 'better-auth/api'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { auth } from './auth'

export type SignInState = { error?: string }

const credentials = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
})

export async function signIn(_: SignInState, form: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({ email: form.get('email'), password: form.get('password') })
  if (!parsed.success) return { error: 'Enter your email and password.' }
  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() })
  } catch (e) {
    if (isAPIError(e)) return { error: "That email and password don't match." }
    console.error(e)
    return { error: "We couldn't sign you in. Please try again in a moment." }
  }
  redirect('/admin')
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() })
  redirect('/login')
}
