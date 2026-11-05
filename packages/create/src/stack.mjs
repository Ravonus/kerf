// The `--db` and `--auth` part of a scaffold (research 28 §6): a database, a todo app on it, and with `--auth` a
// sign-in/sign-up flow and a guarded `/todos`. Pinned versions, so a scaffold builds what the matrix tested.
import { readFileSync } from 'node:fs'
import {
  nativeAuthSql,
  nativeFiles,
  prismaAdapterPackage,
  prismaAuthModels,
  prismaFiles,
} from './data.mjs'
import { authTablesFile, sqliteSchema, pgSchema, mysqlSchema } from './stack/schema.mjs'
import { loginPage } from './stack/pages.mjs'
export { sharedAuthTables } from './stack/schema.mjs'
export {
  tailwindPackages,
  TAILWIND_VITE,
  TAILWIND_CSS,
  classes,
  controls,
  todosPage,
  loginPage,
} from './stack/pages.mjs'

/** The version a scaffold pins for each package it adds that isn't weft's own: what the matrix tested. */
export const VERSIONS = {
  '@types/node': '26.6.5',
  '@t3-oss/env-core': '0.13.11',
  'better-auth': '1.7.14',
  'drizzle-kit': '0.31.11',
  'drizzle-orm': '0.45.4',
  'drizzle-zod': '0.8.3',
  kysely: '0.29.7',
  mysql2: '3.24.6',
  postgres: '4.0.0',
  zod: '4.6.7',
  prisma: '7.10.1',
  '@prisma/client': '7.10.1',
  '@prisma/adapter-libsql': '7.10.1',
  '@prisma/adapter-pg': '7.10.1',
  '@prisma/adapter-mariadb': '7.10.1',
}

const pin = (...names) => Object.fromEntries(names.map((n) => [n, VERSIONS[n]]))

const drivers = (db) => (db === 'postgres' ? ['postgres'] : db === 'mysql' ? ['mysql2'] : [])

/** Every scaffold pins what it shipped with: this package and weft's others go out at one version. */
export const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version

/** The pinned dependencies of a database, data layer and auth choice. */
export function stackDeps({ db, auth, layer = 'drizzle', version = VERSION }) {
  if (db === 'none') return { deps: {}, dev: {} }
  const base = pin('@t3-oss/env-core', 'zod', ...(auth ? ['better-auth'] : []))
  if (layer === 'native')
    return {
      deps: {
        ...base,
        ...pin(...drivers(db), ...(auth ? ['kysely'] : [])),
        '@weft-js/db': version,
      },
      dev: pin('@types/node'),
    }
  if (layer === 'prisma')
    return {
      deps: { ...base, ...pin('@prisma/client', prismaAdapterPackage(db)), '@weft-js/db': version },
      dev: pin('prisma', '@types/node'),
    }
  return {
    deps: pin(
      '@t3-oss/env-core',
      'drizzle-orm',
      'drizzle-zod',
      'zod',
      ...drivers(db),
      ...(auth ? ['better-auth'] : []),
    ),
    dev: pin('drizzle-kit', '@types/node'),
  }
}

/** Sign-in on an app with a database, for `weft add auth`: new files only, and what to add to the existing ones. */
export function authFiles({ db, layer, ui }) {
  const files = stackFiles({ db, layer, auth: true, name: 'app', secret: '' })
  const out = {
    'src/auth.server.ts': files['src/auth.server.ts'],
    'src/server/session.ts': files['src/server/session.ts'],
    'src/routes/login.tsx': loginPage(ui),
  }
  return {
    files: out,
    context: files['src/context.server.ts'],
    tables: {
      drizzle: authTablesFile(db),
      prisma: prismaAuthModels(db),
      native: nativeAuthSql(db),
    }[layer],
  }
}

/** The files of a database, data layer and auth choice, as `{ path: text }`. */
export function stackFiles({ db, auth, name, secret, layer = 'drizzle' }) {
  const shared = {
    '.env': envFile({ db, auth, name, secret }),
    '.env.example': envFile({ db, auth, name, secret: '' }),
    'src/env.server.ts': envModule({ db, auth }),
    'src/context.server.ts': context(auth),
    'src/routes/todos/index.tsx': '', // filled by the caller, which knows the UI kit
    ...(auth && {
      'src/server/session.ts': sessionServer(),
      'src/routes/todos/_layout.tsx': guard(),
    }),
  }
  if (layer === 'native') return { ...shared, ...nativeFiles({ db, auth }) }
  if (layer === 'prisma') return { ...shared, ...prismaFiles({ db, auth }) }
  return { ...shared, ...drizzleFiles({ db, auth }) }
}

function drizzleFiles({ db, auth }) {
  return {
    'drizzle.config.ts': `import { defineConfig } from 'drizzle-kit'\n\nexport default defineConfig({ dialect: '${{ postgres: 'postgresql', sqlite: 'sqlite', mysql: 'mysql' }[db]}', schema: './src/db/schema.ts', out: './drizzle' })\n`,
    'src/db/schema.ts': { postgres: pgSchema, sqlite: sqliteSchema, mysql: mysqlSchema }[db](auth),
    'src/db/index.server.ts': `import { createDb } from '@weft-js/start/db/${db}'\nimport { env } from '../env.server'\nimport * as schema from './schema'\n\nexport const db = createDb({ schema, url: env.DATABASE_URL })\n`,
    'src/server/todos.ts': todosServer(auth, db),
    ...(auth && {
      'src/auth.server.ts': `import { createAuth } from '@weft-js/start/auth/better-auth'\nimport { drizzleAuth } from '@weft-js/start/auth/drizzle'\nimport { db } from '#/db/index.server'\nimport * as schema from './db/schema'\nimport { env } from './env.server'\n\nexport default createAuth({ db, secret: env.BETTER_AUTH_SECRET, options: { database: drizzleAuth(db, schema) } })\n`,
    }),
  }
}

const database = (name) => name.replace(/[^a-z0-9_]/g, '_')
const envFile = ({ db, auth, name, secret }) =>
  ({
    postgres: `DATABASE_URL=postgres://localhost:5432/${database(name)}\n`,
    mysql: `DATABASE_URL=mysql://root@localhost:3306/${database(name)}\n`,
    sqlite: 'DATABASE_URL=file:.data/app.db\n',
  })[db] + (auth ? `BETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://localhost:5173\n` : '')

const envModule = ({ db, auth }) => `import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

// Checked when the server starts. A build holds no secrets, so \`weft build\` skips it.
export const env = createEnv({
  server: {
    DATABASE_URL: ${db !== 'sqlite' ? 'z.url()' : "z.string().min(1).default('file:.data/app.db')"},${auth ? '\n    BETTER_AUTH_SECRET: z.string().min(32),' : ''}
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.WEFT_BUILD,
})
`

/** `src/context.server.ts`: the database on `ctx`, and the session with auth. */
export const context = (auth) =>
  auth
    ? `import { session } from '@weft-js/start/auth'
import auth from '#/auth.server'
import { db } from '#/db/index.server'

export default async ({ request }: { request: Request }) => ({ db, ...(await session(auth, request)) })

type Session = Awaited<ReturnType<typeof auth.session>>

declare module '@weft-js/start' {
  interface Context {
    db: typeof db
    user: Session['user']
    session: Session['session']
  }
}
`
    : `import { db } from '#/db/index.server'

export default () => ({ db })

declare module '@weft-js/start' {
  interface Context {
    db: typeof db
  }
}
`

function todosServer(auth, db) {
  const use = auth ? `\n  auth: 'user',` : ''
  const mine = auth
    ? `and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id))`
    : `eq(todos.id, input.id)`
  // MySQL has no \`returning\`.
  const returning = db === 'mysql' ? '' : '.returning()'
  return `import { mutation, query } from '@weft-js/start'
import { schemasOf } from '@weft-js/start/db'
import { ${auth ? 'and, ' : ''}asc, eq, not } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '#/db/schema'

const { todos } = schema
const schemas = schemasOf(schema, { todos: { title: (s: z.ZodString) => s.trim().min(1).max(200) } })
const byId = z.object({ id: z.string() })

export const listTodos = query({
  tags: ['todos'],${use}
  run: ({ ctx }) => ctx.db.select().from(todos)${auth ? '.where(eq(todos.userId, ctx.user.id))' : ''}.orderBy(asc(todos.createdAt)),
})

export const addTodo = mutation({
  input: schemas.todos.insert.pick({ title: true }),${use}
  invalidates: ['todos'],
  optimistic: ({ input }, cache) =>
    cache.update(listTodos, undefined, list => void list.push({ id: \`tmp:\${input.title}\`,${auth ? " userId: ''," : ''} title: input.title, done: false, createdAt: 0 })),
  run: async ({ input, ctx }) => {
    ${
      db === 'mysql'
        ? `const row = { id: crypto.randomUUID(),${auth ? ' userId: ctx.user.id,' : ''} title: input.title, createdAt: Date.now() }
    await ctx.db.insert(todos).values(row)
    return { ...row, done: false }`
        : `const [row] = await ctx.db.insert(todos).values({ id: crypto.randomUUID(),${auth ? ' userId: ctx.user.id,' : ''} title: input.title, createdAt: Date.now() }).returning()
    return row`
    }
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
  run: ({ input, ctx }) => ctx.db.update(todos).set({ done: not(todos.done) }).where(${mine})${returning},
})

export const deleteTodo = mutation({
  input: byId,${use}
  invalidates: ['todos'],
  optimistic: ({ input }, cache) => cache.update(listTodos, undefined, list => list.filter(x => x.id !== input.id)),
  run: ({ input, ctx }) => ctx.db.delete(todos).where(${mine})${returning},
})
`
}

const sessionServer = () => `import { mutation, query, redirect } from '@weft-js/start'
import { forward } from '@weft-js/start/auth'
import { z } from 'zod'
import auth from '#/auth.server'

const credentials = z.object({ email: z.email(), password: z.string().min(8) })

/** Who is signed in, or null. */
export const me = query({
  tags: ['session'],
  run: ({ ctx }) => (ctx.user ? { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email } : null),
})

export const signUp = mutation({
  input: credentials.extend({ name: z.string().trim().min(1) }),
  run: async ({ input, ctx }) => {
    await forward(ctx, auth.api.signUpEmail({ body: input, headers: ctx.request.headers, asResponse: true }))
    redirect('/todos')
  },
})

export const signIn = mutation({
  input: credentials,
  run: async ({ input, ctx }) => {
    await forward(ctx, auth.api.signInEmail({ body: input, headers: ctx.request.headers, asResponse: true }))
    redirect('/todos')
  },
})

export const signOut = mutation({
  run: async ({ ctx }) => {
    await forward(ctx, auth.api.signOut({ headers: ctx.request.headers, asResponse: true }))
    redirect('/login')
  },
})
`

const guard = () => `import { redirect, type LoadArgs, type RouteProps } from '@weft-js/start'

// The guard: a layout's \`load\` runs before its pages', so nothing under /todos runs for a visitor.
export const load = ({ ctx }: LoadArgs) => {
  if (!ctx.user) redirect('/login')
}

export default function TodosLayout(props: RouteProps) {
  return <>{props.children}</>
}
`
