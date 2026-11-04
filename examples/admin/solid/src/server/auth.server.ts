import { redirect } from '@solidjs/router'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getSessionCookie } from 'better-auth/cookies'
import { getRequestEvent } from 'solid-js/web'

import { db } from '~/db/index.server'
import * as schema from '~/db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true, disableSignUp: true },
})

type Session = Awaited<ReturnType<typeof auth.api.getSession>>

declare global {
  namespace App {
    interface RequestEventLocals {
      session?: Promise<Session>
    }
  }
}

/** Once per request, single-flight refetches included, and with no query at all when there's no cookie to look up. */
export function currentSession() {
  const event = getRequestEvent()!
  const { headers } = event.request
  return (event.locals.session ??= getSessionCookie(headers)
    ? auth.api.getSession({ headers })
    : Promise.resolve(null))
}

export async function requireUser() {
  const session = await currentSession()
  if (!session) throw redirect('/login')
  return session.user
}
