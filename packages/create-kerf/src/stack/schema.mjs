export const authTablesFile = (db) =>
  ({
    sqlite: () =>
      `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'\n${authTablesSqlite()}`,
    postgres: () =>
      `import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'\n${authTablesPg()}`,
    mysql: () =>
      `import { boolean, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core'\n${authTablesMysql()}`,
  })[db]()

const camel = (column) => column.replace(/_(\w)/g, (_, c) => c.toUpperCase())

/** A template's `src/db/auth.ts`: Better Auth's own column names with time zones, as examples/shared/pg/schema.sql has them. */
export const sharedAuthTables = () =>
  `import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'\n${authTablesPg().replace(
    /(text|boolean|timestamp)\('(\w+)'\)/g,
    (_, type, column) =>
      `${type}('${camel(column)}'${type === 'timestamp' ? ', { withTimezone: true }' : ''})`,
  )}`

export function sqliteSchema(auth) {
  const owner = auth
    ? `\n  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),`
    : ''
  return `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
${auth ? authTablesSqlite() : ''}
export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),${owner}
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
})
`
}

export function pgSchema(auth) {
  const owner = auth
    ? `\n  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),`
    : ''
  return `import { bigint, boolean, pgTable, text${auth ? ', timestamp' : ''} } from 'drizzle-orm/pg-core'
${auth ? authTablesPg() : ''}
export const todos = pgTable('todos', {
  id: text('id').primaryKey(),${owner}
  title: text('title').notNull(),
  done: boolean('done').notNull().default(false),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})
`
}

// MySQL can't index a TEXT column, so ids, keys and anything unique are VARCHAR. Otherwise Postgres's tables hold.
const authTablesMysql = () =>
  authTablesPg()
    .replaceAll('pgTable', 'mysqlTable')
    .replace(
      /text\('(id|user_id|email|token|account_id|provider_id|identifier)'\)/g,
      "varchar('$1', { length: 255 })",
    )
    .replace(/timestamp\('(\w+)'\)/g, "timestamp('$1', { fsp: 3 })")

export function mysqlSchema(auth) {
  const owner = auth
    ? `\n  userId: varchar('user_id', { length: 255 }).notNull().references(() => user.id, { onDelete: 'cascade' }),`
    : ''
  return `import { bigint, boolean, mysqlTable, ${auth ? 'text, timestamp, ' : ''}varchar } from 'drizzle-orm/mysql-core'
${auth ? authTablesMysql() : ''}
export const todos = mysqlTable('todos', {
  id: varchar('id', { length: 36 }).primaryKey(),${owner}
  title: varchar('title', { length: 200 }).notNull(),
  done: boolean('done').notNull().default(false),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
})
`
}

const authTablesSqlite = () => {
  const when = (col, opts = '.notNull()') => `integer('${col}', { mode: 'timestamp_ms' })${opts}`
  return `
// Better Auth's tables: it reads and writes them through Drizzle, with these names.
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: ${when('created_at')},
  updatedAt: ${when('updated_at')},
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: ${when('expires_at')},
  token: text('token').notNull().unique(),
  createdAt: ${when('created_at')},
  updatedAt: ${when('updated_at')},
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: ${when('access_token_expires_at', '')},
  refreshTokenExpiresAt: ${when('refresh_token_expires_at', '')},
  scope: text('scope'),
  password: text('password'),
  createdAt: ${when('created_at')},
  updatedAt: ${when('updated_at')},
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: ${when('expires_at')},
  createdAt: ${when('created_at', '')},
  updatedAt: ${when('updated_at', '')},
})

export const jwks = sqliteTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: ${when('created_at')},
  expiresAt: ${when('expires_at', '')},
  alg: text('alg'),
  crv: text('crv'),
})
`
}

const authTablesPg = () => `
// Better Auth's tables: it reads and writes them through Drizzle, with these names.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
})

export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at').notNull(),
  expiresAt: timestamp('expires_at'),
  alg: text('alg'),
  crv: text('crv'),
})
`
