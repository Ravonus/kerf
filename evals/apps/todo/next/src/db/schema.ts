import { boolean, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

const at = (name: string) => timestamp(name, { withTimezone: true })

export const user = pgTable('user', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: text('name').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  createdAt: at('createdAt').notNull(),
  updatedAt: at('updatedAt').notNull(),
})

export const session = pgTable('session', {
  id: varchar('id', { length: 255 }).primaryKey(),
  expiresAt: at('expiresAt').notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  createdAt: at('createdAt').notNull(),
  updatedAt: at('updatedAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: varchar('userId', { length: 255 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: varchar('id', { length: 255 }).primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: varchar('userId', { length: 255 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: at('accessTokenExpiresAt'),
  refreshTokenExpiresAt: at('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: at('createdAt').notNull(),
  updatedAt: at('updatedAt').notNull(),
})

export const verification = pgTable('verification', {
  id: varchar('id', { length: 255 }).primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: at('expiresAt').notNull(),
  createdAt: at('createdAt'),
  updatedAt: at('updatedAt'),
})

export const todos = pgTable('todos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: boolean('done').notNull().default(false),
  createdAt: at('created_at').notNull().defaultNow(),
})
