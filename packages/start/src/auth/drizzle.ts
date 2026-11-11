// Better Auth on a Drizzle client, as `options.database`. It's an entry of its own so that a Drizzle app without auth
// needs no better-auth, and an app on another data layer needs no drizzle-orm.

import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getTableName, isTable } from 'drizzle-orm'
import type { DbHandle } from '../db/core'

const PROVIDER = { sqlite: 'sqlite', postgresql: 'pg', mysql: 'mysql' } as const

/** Better Auth's store on a Kerf database, for `createAuth`'s `options.database`. */
export function drizzleAuth(db: { $kerf: DbHandle }, schema?: Record<string, unknown>) {
  for (const name of ['user', 'session', 'account', 'verification', 'jwks']) {
    const t = schema?.[name]
    if (isTable(t)) db.$kerf.exempt.add(getTableName(t))
  }
  return drizzleAdapter(db, { provider: PROVIDER[db.$kerf.dialect], schema })
}
