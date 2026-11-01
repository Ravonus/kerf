import { boolean, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { user } from './auth'

export * from './auth'

export const todos = pgTable('todos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: boolean('done').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('todos_user').on(table.userId, table.createdAt, table.id)])
