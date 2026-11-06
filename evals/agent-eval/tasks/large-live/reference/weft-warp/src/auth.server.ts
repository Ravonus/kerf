import { createAuth } from '@weft-js/start/auth/better-auth'
import { drizzleAuth } from '@weft-js/start/auth/drizzle'
import { db } from '#/db/index.server'
import * as schema from './db/schema'
import { env } from './env.server'

export default createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  options: { database: drizzleAuth(db, schema) },
})
