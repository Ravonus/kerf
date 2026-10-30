// Better Auth on a Drizzle client. Only Drizzle's drivers load this, so an app on another data layer needs no drizzle-orm.

import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getTableName, isTable } from 'drizzle-orm'
import type { DbHandle } from './core'

export function drizzleAuth(db: object, handle: DbHandle, provider: 'pg' | 'sqlite' | 'mysql', schema?: Record<string, unknown>) {
  for (const name of ['user', 'session', 'account', 'verification']) {
    const t = schema?.[name]
    if (isTable(t)) handle.exempt.add(getTableName(t))
  }
  return drizzleAdapter(db as any, { provider, schema })
}
