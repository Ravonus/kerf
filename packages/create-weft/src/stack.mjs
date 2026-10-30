// The `--db` and `--auth` part of a scaffold (research 28 §6): a database, a todo app on it, and with `--auth` a
// sign-in/sign-up flow and a guarded `/todos`. Pinned versions, so a scaffold builds what the matrix tested.

const VERSIONS = {
  '@types/node': '26.6.5',
  '@t3-oss/env-core': '0.13.11', 'better-auth': '1.7.14', 'drizzle-kit': '0.31.11', 'drizzle-orm': '0.45.4', 'drizzle-zod': '0.8.3', postgres: '4.0.0', zod: '4.6.7',
}
const pin = (...names) => Object.fromEntries(names.map(n => [n, VERSIONS[n]]))

export function stackDeps({ db, auth }) {
  if (db === 'none') return { deps: {}, dev: {} }
  return {
    deps: pin('@t3-oss/env-core', 'drizzle-orm', 'drizzle-zod', 'zod', ...(db === 'postgres' ? ['postgres'] : []), ...(auth ? ['better-auth'] : [])),
    dev: pin('drizzle-kit', '@types/node'),
  }
}

export function stackFiles({ db, auth, name, secret }) {
  const pg = db === 'postgres'
  return {
    'drizzle.config.ts': `import { defineConfig } from 'drizzle-kit'\n\nexport default defineConfig({ dialect: '${pg ? 'postgresql' : 'sqlite'}', schema: './src/db/schema.ts', out: './drizzle' })\n`,
    '.env': envFile({ pg, auth, name, secret }),
    '.env.example': envFile({ pg, auth, name, secret: '' }),
    'src/env.server.ts': envModule({ pg, auth }),
    'src/db/schema.ts': pg ? pgSchema(auth) : sqliteSchema(auth),
    'src/db/index.server.ts': `import { createDb } from '@weft/start/db/${pg ? 'postgres' : 'sqlite'}'\nimport { env } from '../env.server'\nimport * as schema from './schema'\n\nexport const db = createDb({ schema, url: env.DATABASE_URL })\n`,
    'src/context.server.ts': context(auth),
    'src/server/todos.ts': todosServer(auth),
    'src/routes/todos/index.tsx': '', // filled by the caller, which knows the UI kit
    ...(auth && {
      'src/auth.server.ts': `import { createAuth } from '@weft/start/auth'\nimport { db } from '#/db/index.server'\nimport * as schema from './db/schema'\nimport { env } from './env.server'\n\nexport default createAuth({ db, schema, secret: env.BETTER_AUTH_SECRET })\n`,
      'src/server/session.ts': sessionServer(),
      'src/routes/todos/_layout.tsx': guard(),
    }),
  }
}

const envFile = ({ pg, auth, name, secret }) =>
  (pg ? `DATABASE_URL=postgres://localhost:5432/${name.replace(/[^a-z0-9_]/g, '_')}\n` : 'DATABASE_URL=file:.data/app.db\n') +
  (auth ? `BETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://localhost:5173\n` : '')

const envModule = ({ pg, auth }) => `import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

// Checked when the server starts. A build holds no secrets, so \`weft build\` skips it.
export const env = createEnv({
  server: {
    DATABASE_URL: ${pg ? 'z.url()' : "z.string().min(1).default('file:.data/app.db')"},${auth ? '\n    BETTER_AUTH_SECRET: z.string().min(32),' : ''}
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.WEFT_BUILD,
})
`

function sqliteSchema(auth) {
  const owner = auth ? `\n  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),` : ''
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

function pgSchema(auth) {
  const owner = auth ? `\n  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),` : ''
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
`

const context = auth => auth
  ? `import { session } from '@weft/start/auth'
import auth from '#/auth.server'
import { db } from '#/db/index.server'

export default async ({ request }: { request: Request }) => ({ db, ...(await session(auth, request)) })

type Session = Awaited<ReturnType<typeof session<typeof auth>>>

declare module '@weft/start' {
  interface Context {
    db: typeof db
    user: Session['user']
    session: Session['session']
  }
}
`
  : `import { db } from '#/db/index.server'

export default () => ({ db })

declare module '@weft/start' {
  interface Context {
    db: typeof db
  }
}
`

function todosServer(auth) {
  const use = auth ? `\n  auth: 'user',` : ''
  const mine = auth ? `and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id))` : `eq(todos.id, input.id)`
  return `import { mutation, query } from '@weft/start'
import { schemasOf } from '@weft/start/db'
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
    const [row] = await ctx.db.insert(todos).values({ id: crypto.randomUUID(),${auth ? ' userId: ctx.user.id,' : ''} title: input.title, createdAt: Date.now() }).returning()
    return row
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
  run: ({ input, ctx }) => ctx.db.update(todos).set({ done: not(todos.done) }).where(${mine}).returning(),
})

export const deleteTodo = mutation({
  input: byId,${use}
  invalidates: ['todos'],
  optimistic: ({ input }, cache) => cache.update(listTodos, undefined, list => list.filter(x => x.id !== input.id)),
  run: ({ input, ctx }) => ctx.db.delete(todos).where(${mine}).returning(),
})
`
}

const sessionServer = () => `import { mutation, query, redirect } from '@weft/start'
import { forward } from '@weft/start/auth'
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

const guard = () => `import { redirect, type LoadArgs, type RouteProps } from '@weft/start'

// The guard: a layout's \`load\` runs before its pages', so nothing under /todos runs for a visitor.
export const load = ({ ctx }: LoadArgs) => {
  if (!ctx.user) redirect('/login')
}

export default function TodosLayout(props: RouteProps) {
  return <>{props.children}</>
}
`

// Tailwind: the same files `weft add tailwind` writes (packages/cli/src/tailwind.mjs, held equal by a test).
export const tailwindPackages = { tailwindcss: '4.3.3', '@tailwindcss/vite': '4.3.3' }
export const TAILWIND_VITE = `import tailwindcss from '@tailwindcss/vite'

export default { plugins: [tailwindcss()] }
`
export const TAILWIND_CSS = `@import "tailwindcss";
`
const tw = {
  card: 'mx-auto max-w-2xl space-y-4 rounded-lg border border-current/15 p-6',
  title: 'text-2xl font-semibold',
  button: 'rounded-md border border-current/30 px-3 py-1.5 hover:bg-current/5',
  input: 'rounded-md border border-current/30 px-3 py-1.5',
}
/** The class of a scaffold element: Tailwind's utilities, or the plain CSS in src/app.css. */
export const classes = (ui, part) => (ui === 'tailwind' ? tw[part] : part === 'card' ? 'card' : '')
const attr = (ui, part) => (ui === 'tailwind' ? ` class="${tw[part]}"` : '')

/** The page's controls in each UI kit: warp's components, or plain elements with the same roles and names. */
export const controls = ui => ui === 'warp'
  ? {
      imports: `import { Alert, Button, Card, Checkbox, Input } from '@weft/warp'\n`,
      card: (title, body) => `<Card title=${JSON.stringify(title)}>${body}</Card>`,
      input: (label, box, type = 'text') => `<Input label=${JSON.stringify(label)} type="${type}" value={${box}.value} onInput={e => (${box}.value = e.currentTarget.value)} />`,
      submit: (label, pending) => `<Button type="submit" loading={${pending}}>${label}</Button>`,
      button: (label, onClick, extra = '') => `<Button emphasis="ghost" ${extra}onClick={${onClick}}>${label}</Button>`,
      error: box => `{${box}.value && <Alert tone="critical" live>{${box}.value}</Alert>}`,
    }
  : {
      imports: '',
      card: (title, body) => `<section class="${classes(ui, 'card')}"><h1${attr(ui, 'title')}>${title}</h1>${body}</section>`,
      input: (label, box, type = 'text') => `<label>${label} <input${attr(ui, 'input')} type="${type}" value={${box}.value} onInput={e => (${box}.value = e.currentTarget.value)} /></label>`,
      submit: (label, pending) => `<button${attr(ui, 'button')} type="submit" disabled={${pending}}>${label}</button>`,
      button: (label, onClick, extra = '') => `<button${attr(ui, 'button')} type="button" ${extra}onClick={${onClick}}>${label}</button>`,
      error: box => `{${box}.value && <p role="alert">{${box}.value}</p>}`,
    }

export function todosPage(ui, auth) {
  const c = controls(ui)
  return `import type { Meta } from '@weft/start'
import { Boundary, state } from 'weft'
${c.imports}import { addTodo, deleteTodo, listTodos, toggleTodo } from '#/server/todos'

export const meta: Meta = { title: 'Todos' }

export default function Todos() {
  const todos = listTodos()
  const title = state('')
  const problem = state('')
  const add = async (e: SubmitEvent) => {
    e.preventDefault()
    const text = title.value.trim()
    if (!text) return
    title.value = ''
    problem.value = ''
    await addTodo({ title: text }).catch((err: Error) => (problem.value = err.message))
  }
  return (
    ${c.card('Todos', `
      <form onSubmit={add}>
        ${c.input('New todo', 'title')}
        ${c.submit('Add', 'addTodo.pending.value')}
      </form>
      ${c.error('problem')}
      <Boundary pending={<p>Loading…</p>}>
        <ul class="todos">
          {(todos.value ?? []).map(t => (
            <li key={t.id} class={t.done ? 'done' : 'open'}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => toggleTodo({ id: t.id })} /> {t.title}
              </label>
              <button type="button" aria-label={\`Delete \${t.title}\`} onClick={() => deleteTodo({ id: t.id })}>×</button>
            </li>
          ))}
        </ul>
      </Boundary>
    `)}
  )
}
`
}

export function loginPage(ui) {
  const c = controls(ui)
  return `import { redirect, type LoadArgs, type Meta } from '@weft/start'
import { state } from 'weft'
${c.imports}import { signIn, signUp } from '#/server/session'

export const load = ({ ctx }: LoadArgs) => {
  if (ctx.user) redirect('/todos')
}

export const meta: Meta = { title: 'Sign in' }

export default function Login() {
  const creating = state(false)
  const name = state('')
  const email = state('')
  const password = state('')
  const problem = state('')
  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    problem.value = ''
    const done = creating.value
      ? signUp({ name: name.value, email: email.value, password: password.value })
      : signIn({ email: email.value, password: password.value })
    await done.catch((err: Error) => (problem.value = err.message))
  }
  return (
    ${c.card('Sign in', `
      <form onSubmit={submit}>
        {creating.value && ${c.input('Name', 'name')}}
        ${c.input('Email', 'email', 'email')}
        ${c.input('Password', 'password', 'password')}
        ${c.submit(`{creating.value ? 'Create account' : 'Sign in'}`, 'signIn.pending.value || signUp.pending.value')}
      </form>
      ${c.error('problem')}
      ${c.button(`{creating.value ? 'I have an account' : 'Create an account'}`, '() => (creating.value = !creating.value)')}
    `)}
  )
}
`
}
