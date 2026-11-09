import { eq, getTableName, type AnyColumn, type SQL, type Table } from 'drizzle-orm'
import type { DbHandle } from '@weft-js/start/db/core'
import type { PayStore, Purchase } from './server'

/** A Drizzle client as far as the ledger uses one: the dialects' builders share no type, so this names what they have in common. */
interface LedgerClient {
  select(fields?: Record<string, AnyColumn>): {
    from(table: Table): {
      where(on: SQL | undefined): Promise<Purchase[]> & { limit(n: number): Promise<Purchase[]> }
    }
  }
  insert(table: Table): {
    values(row: object): Promise<unknown> & {
      onDuplicateKeyUpdate(update: { set: object }): Promise<unknown>
      onConflictDoNothing(): Promise<unknown>
      onConflictDoUpdate(update: { target: AnyColumn; set: object }): Promise<unknown>
    }
  }
}

/** A `PayStore` on the app's Drizzle tables, on Postgres, SQLite or MySQL. */
export function drizzlePayStore(
  db: { $weft: DbHandle },
  tables: {
    purchases: Table & { id: AnyColumn; user: AnyColumn }
    payEvents: Table & { id: AnyColumn }
  },
): PayStore {
  const { purchases, payEvents } = tables
  const client = db as unknown as LedgerClient
  const mysql = db.$weft.dialect === 'mysql'
  db.$weft.exempt.add(getTableName(purchases)).add(getTableName(payEvents)) // written by a webhook, not by a server function
  return {
    seen: async (id) =>
      (
        await client
          .select({ id: payEvents.id })
          .from(payEvents)
          .where(eq(payEvents.id, id))
          .limit(1)
      ).length > 0,
    async mark(id, at) {
      const insert = client.insert(payEvents).values({ id, at })
      await (mysql ? insert.onDuplicateKeyUpdate({ set: { id } }) : insert.onConflictDoNothing())
    },
    purchase: async (id) =>
      (await client.select().from(purchases).where(eq(purchases.id, id)).limit(1))[0] ?? null,
    async save(row: Purchase) {
      const { id: _id, ...set } = row
      const insert = client.insert(purchases).values(row)
      await (mysql
        ? insert.onDuplicateKeyUpdate({ set })
        : insert.onConflictDoUpdate({ target: purchases.id, set }))
    },
    byUser: (user) => client.select().from(purchases).where(eq(purchases.user, user)),
  }
}
