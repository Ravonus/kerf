// The Native and Prisma data layers of a scaffold (research 34 §4), beside Drizzle's in stack.mjs. Each writes the same
// todo app, so the same e2e holds for every layer. `weft add db` writes these files too.

const engineSql = {
  sqlite: { bool: 'integer not null default 0', big: 'integer' },
  postgres: { bool: 'boolean not null default false', big: 'bigint' },
  mysql: { bool: 'boolean not null default false', big: 'bigint' },
}

export const nativeFiles = ({ db }) => ({
  'migrations/0000_todos.sql': `create table todos (
  id varchar(36) primary key,
  title varchar(200) not null,
  done ${engineSql[db].bool},
  created_at ${engineSql[db].big} not null
);
`,
  'src/db/index.server.ts': `import { createDb } from '@weft/plugin-db-native/${db}'
import { env } from '../env.server'

export const db = createDb({ url: env.DATABASE_URL })
`,
  'src/server/todos.ts': `import { mutation, query } from '@weft/start'
import { z } from 'zod'

interface Todo { id: string; title: string; done: boolean }
const byId = z.object({ id: z.string() })

export const listTodos = query({
  tags: ['todos'],
  run: async ({ ctx }) => {
    const rows = await ctx.db.sql\`select id, title, done from todos order by created_at\`
    return (rows as unknown as Todo[]).map(t => ({ ...t, done: Boolean(t.done) }))
  },
})

export const addTodo = mutation({
  input: z.object({ title: z.string().trim().min(1).max(200) }),
  invalidates: ['todos'],
  optimistic: ({ input }, cache) =>
    cache.update(listTodos, undefined, list => void list.push({ id: \`tmp:\${input.title}\`, title: input.title, done: false })),
  run: async ({ input, ctx }) => {
    await ctx.db.sql\`insert into todos (id, title, done, created_at) values (\${crypto.randomUUID()}, \${input.title}, \${false}, \${Date.now()})\`
  },
})

export const toggleTodo = mutation({
  input: byId,
  invalidates: ['todos'],
  optimistic: ({ input }, cache) =>
    cache.update(listTodos, undefined, list => {
      const t = list.find(x => x.id === input.id)
      if (t) t.done = !t.done
    }),
  run: async ({ input, ctx }) => {
    await ctx.db.sql\`update todos set done = not done where id = \${input.id}\`
  },
})

export const deleteTodo = mutation({
  input: byId,
  invalidates: ['todos'],
  optimistic: ({ input }, cache) => cache.update(listTodos, undefined, list => list.filter(x => x.id !== input.id)),
  run: async ({ input, ctx }) => {
    await ctx.db.sql\`delete from todos where id = \${input.id}\`
  },
})
`,
})

const PROVIDER = { sqlite: 'sqlite', postgres: 'postgresql', mysql: 'mysql' }
const ADAPTER = {
  sqlite: { pkg: '@prisma/adapter-libsql', name: 'PrismaLibSql', make: "{ url: env.DATABASE_URL }" },
  postgres: { pkg: '@prisma/adapter-pg', name: 'PrismaPg', make: "{ connectionString: env.DATABASE_URL }" },
  mysql: { pkg: '@prisma/adapter-mariadb', name: 'PrismaMariaDb', make: 'env.DATABASE_URL' },
}
export const prismaAdapterPackage = db => ADAPTER[db].pkg

const authModels = db => {
  const long = db === 'mysql' ? ' @db.Text' : ''
  return `
// Better Auth's tables: it reads and writes them through Prisma, with these names.
model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean   @map("email_verified")
  image         String?${long}
  createdAt     DateTime  @map("created_at")
  updatedAt     DateTime  @map("updated_at")
  sessions      Session[]
  accounts      Account[]
  todos         Todo[]

  @@map("user")
}

model Session {
  id        String   @id
  expiresAt DateTime @map("expires_at")
  token     String   @unique
  createdAt DateTime @map("created_at")
  updatedAt DateTime @map("updated_at")
  ipAddress String?  @map("ip_address")
  userAgent String?  @map("user_agent")${long}
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String    @map("account_id")
  providerId            String    @map("provider_id")
  userId                String    @map("user_id")
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?   @map("access_token")${long}
  refreshToken          String?   @map("refresh_token")${long}
  idToken               String?   @map("id_token")${long}
  accessTokenExpiresAt  DateTime? @map("access_token_expires_at")
  refreshTokenExpiresAt DateTime? @map("refresh_token_expires_at")
  scope                 String?
  password              String?
  createdAt             DateTime  @map("created_at")
  updatedAt             DateTime  @map("updated_at")

  @@map("account")
}

model Verification {
  id         String    @id
  identifier String
  value      String${long}
  expiresAt  DateTime  @map("expires_at")
  createdAt  DateTime? @map("created_at")
  updatedAt  DateTime? @map("updated_at")

  @@map("verification")
}
`
}

const prismaTodos = auth => {
  const use = auth ? `\n  auth: 'user',` : ''
  const mine = auth ? `, userId: ctx.user.id` : ''
  return `import { mutation, query } from '@weft/start'
import { z } from 'zod'

const byId = z.object({ id: z.string() })

export const listTodos = query({
  tags: ['todos'],${use}
  run: ({ ctx }) => ctx.db.todo.findMany({ where: {${mine.slice(1)} }, orderBy: { createdAt: 'asc' }, select: { id: true, title: true, done: true } }),
})

export const addTodo = mutation({
  input: z.object({ title: z.string().trim().min(1).max(200) }),${use}
  invalidates: ['todos'],
  optimistic: ({ input }, cache) =>
    cache.update(listTodos, undefined, list => void list.push({ id: \`tmp:\${input.title}\`, title: input.title, done: false })),
  run: async ({ input, ctx }) => {
    await ctx.db.todo.create({ data: { id: crypto.randomUUID(), title: input.title${mine} } })
  },
})

export const toggleTodo = mutation({
  input: byId,${use}
  invalidates: ['todos'],
  optimistic: ({ input }, cache) =>
    cache.update(listTodos, undefined, list => {
      const t = list.find(x => x.id === input.id)
      if (t) t.done = !t.done
    }),
  run: async ({ input, ctx }) => {
    const todo = await ctx.db.todo.findFirst({ where: { id: input.id${mine} } })
    if (todo) await ctx.db.todo.update({ where: { id: todo.id }, data: { done: !todo.done } })
  },
})

export const deleteTodo = mutation({
  input: byId,${use}
  invalidates: ['todos'],
  optimistic: ({ input }, cache) => cache.update(listTodos, undefined, list => list.filter(x => x.id !== input.id)),
  run: async ({ input, ctx }) => {
    await ctx.db.todo.deleteMany({ where: { id: input.id${mine} } })
  },
})
`
}

export const prismaFiles = ({ db, auth }) => ({
  'prisma/schema.prisma': `generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "${PROVIDER[db]}"
}
${auth ? authModels(db) : ''}
model Todo {
  id        String   @id
  title     String
  done      Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at")${auth ? `
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)` : ''}

  @@map("todos")
}
`,
  'prisma.config.ts': `import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

if (existsSync('.env')) process.loadEnvFile()

export default defineConfig({ schema: 'prisma/schema.prisma', datasource: { url: process.env.DATABASE_URL ?? '' } })
`,
  'src/db/index.server.ts': `${db === 'sqlite' ? "import { mkdirSync } from 'node:fs'\n" : ''}import ${`{ ${ADAPTER[db].name} }`} from '${ADAPTER[db].pkg}'
import { withWeft } from '@weft/plugin-db-prisma'
import { PrismaClient } from '../generated/prisma/client'
import { env } from '../env.server'
${db === 'sqlite' ? "\nmkdirSync('.data', { recursive: true })\n" : ''}
const adapter = new ${ADAPTER[db].name}(${ADAPTER[db].make})
export const db = withWeft(new PrismaClient({ adapter, log: [{ emit: 'event', level: 'query' }] }), '${PROVIDER[db]}')
`,
  ...(auth && {
    'src/auth.server.ts': `import { createAuth } from '@weft/start/auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { db } from '#/db/index.server'
import { env } from './env.server'

export default createAuth({ db, secret: env.BETTER_AUTH_SECRET, options: { database: prismaAdapter(db, { provider: '${PROVIDER[db]}' }) } })
`,
  }),
  'src/server/todos.ts': prismaTodos(auth),
})
