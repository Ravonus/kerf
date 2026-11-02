// The ledger on a Drizzle client (research 10 §3): `purchases` and `pay_events`, in the app's schema so they're
// inspectable and joinable like any other table. An entry of its own, so an app on another data layer needs no drizzle-orm.

import { eq, getTableName } from 'drizzle-orm'
import type { DbHandle } from '@weft-js/start/db/core'
import type { PayStore, Purchase } from './server'

export function drizzlePayStore(db: { $weft: DbHandle }, tables: { purchases: any; payEvents: any }): PayStore {
  const { purchases, payEvents } = tables
  const client = db as any
  const mysql = db.$weft.dialect === 'mysql'
  db.$weft.exempt.add(getTableName(purchases)).add(getTableName(payEvents)) // written by a webhook, not by a server function
  return {
    seen: async id => (await client.select({ id: payEvents.id }).from(payEvents).where(eq(payEvents.id, id)).limit(1)).length > 0,
    async mark(id, at) {
      const insert = client.insert(payEvents).values({ id, at })
      await (mysql ? insert.onDuplicateKeyUpdate({ set: { id } }) : insert.onConflictDoNothing())
    },
    purchase: async id => (await client.select().from(purchases).where(eq(purchases.id, id)).limit(1))[0] ?? null,
    async save(row: Purchase) {
      const { id, ...set } = row
      const insert = client.insert(purchases).values(row)
      await (mysql ? insert.onDuplicateKeyUpdate({ set }) : insert.onConflictDoUpdate({ target: purchases.id, set }))
    },
    byUser: user => client.select().from(purchases).where(eq(purchases.user, user)),
  }
}
