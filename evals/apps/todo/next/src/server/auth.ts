import 'server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { cache } from 'react'
import { db } from '@/db'
import { account, session, user, verification } from '@/db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: [nextCookies()],
})

// connection(): an uncached page's prefetch render stops here, before any query, rather than repeating them all beside the real one.
export const currentSession = cache(async () => {
  await connection()
  return auth.api.getSession({ headers: await headers() })
})

/** The signed-in user, or off to /login. Proxy only looks for the cookie; this is the real check, once per request. */
export const currentUser = cache(async () => {
  const found = await currentSession()
  if (!found) redirect('/login')
  return { id: found.user.id, name: found.user.name, email: found.user.email }
})
