import { index, pgTableCreator, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * Every table is prefixed so this app can share a database with others. Column names are spelled out:
 * the source gets snake_case from `casing` on its Drizzle client, and `createDb` has no such option.
 */
export const createTable = pgTableCreator((name) => `lemonstand_${name}`)

export const waitlistSignups = createTable(
  'waitlist_signup',
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    email: d.varchar({ length: 254 }).notNull(),
    role: d.varchar({ length: 32 }),
    source: d.varchar({ length: 64 }),
    userAgent: d.varchar('user_agent', { length: 512 }),
    createdAt: d
      .timestamp('created_at', { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp('updated_at', { withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [uniqueIndex('waitlist_email_idx').on(t.email)],
)

export const contactMessages = createTable(
  'contact_message',
  (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    name: d.varchar({ length: 120 }).notNull(),
    email: d.varchar({ length: 254 }).notNull(),
    role: d.varchar({ length: 32 }).notNull(),
    organization: d.varchar({ length: 160 }),
    interests: d.text().array().notNull().default([]),
    learnerCount: d.varchar('learner_count', { length: 16 }),
    message: d.text().notNull(),
    status: d.varchar({ length: 16 }).notNull().default('new'),
    userAgent: d.varchar('user_agent', { length: 512 }),
    createdAt: d
      .timestamp('created_at', { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index('contact_email_idx').on(t.email), index('contact_created_idx').on(t.createdAt)],
)
