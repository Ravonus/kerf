// Two users' notes. Which database is `DATABASE_URL`'s business: one table definition per dialect, the same columns.
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { integer as sqliteInt, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core'

export const notes = (process.env.DATABASE_URL ?? '').startsWith('postgres')
  ? pgTable('notes', {
      id: serial('id').primaryKey(),
      owner: text('owner').notNull(),
      body: text('body').notNull(),
    })
  : (sqliteTable('notes', {
      id: sqliteInt('id').primaryKey({ autoIncrement: true }),
      owner: sqliteText('owner').notNull(),
      body: sqliteText('body').notNull(),
    }) as any)
void integer
