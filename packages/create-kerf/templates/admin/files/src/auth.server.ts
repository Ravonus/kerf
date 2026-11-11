import { createAuth } from '@kerf-js/start/auth/better-auth'
import { drizzleAuth } from '@kerf-js/start/auth/drizzle'
import { APIError } from 'better-auth/api'
import { db } from '#/db/index.server'
import { user } from './db/auth'
import * as schema from './db/schema'
import { env } from './env.server'

// Everyone signed in can see every order, so the first account is the owner and sign-up closes behind it.
const firstAccountOnly = async () => {
  if (await db.$count(user))
    throw new APIError('FORBIDDEN', {
      message: 'This store already has an owner. Ask them to add you.',
    })
}

export default createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  options: {
    database: drizzleAuth(db, schema),
    databaseHooks: { user: { create: { before: firstAccountOnly } } },
  },
})
