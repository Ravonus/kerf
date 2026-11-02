// Auth in process (research 28 §3): Better Auth on an in-memory SQLite, the session in `ctx`, `auth: 'user'`, sign-in
// through a mutation, the full load when the session changes, guards before children, per-user shared caches. The
// passwords and secret are throwaway test values made here.
import type { Loose } from './loose'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { mutation, query, redirect } from '@weft-js/start'
import { fnOf, StartError } from '@weft-js/start/data'
import { forward, session, sessionChanged } from '../src/auth'
import { createAuth } from '../src/auth/better-auth'
import { drizzleAuth } from '../src/auth/drizzle'
import { createDb } from '../src/db/sqlite'
import { createScope, fetchQuery, memoryStore, runMutation } from '../src/exec'
import { createHandler, type Manifest } from '../src/server'

const when = (name: string) => integer(name, { mode: 'timestamp' }).notNull()
const user = sqliteTable('user', { id: text().primaryKey(), name: text().notNull(), email: text().notNull().unique(), emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(), image: text(), createdAt: when('created_at'), updatedAt: when('updated_at') })
const sess = sqliteTable('session', { id: text().primaryKey(), expiresAt: when('expires_at'), token: text().notNull().unique(), createdAt: when('created_at'), updatedAt: when('updated_at'), ipAddress: text('ip_address'), userAgent: text('user_agent'), userId: text('user_id').notNull() })
const account = sqliteTable('account', { id: text().primaryKey(), accountId: text('account_id').notNull(), providerId: text('provider_id').notNull(), userId: text('user_id').notNull(), accessToken: text('access_token'), refreshToken: text('refresh_token'), idToken: text('id_token'), accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }), refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }), scope: text(), password: text(), createdAt: when('created_at'), updatedAt: when('updated_at') })
const verification = sqliteTable('verification', { id: text().primaryKey(), identifier: text().notNull(), value: text().notNull(), expiresAt: when('expires_at'), createdAt: integer('created_at', { mode: 'timestamp' }), updatedAt: integer('updated_at', { mode: 'timestamp' }) })
const schema = { user, session: sess, account, verification }
const ddl = `create table user (id text primary key, name text not null, email text not null unique, email_verified integer not null, image text, created_at integer not null, updated_at integer not null);
--> statement-breakpoint
create table session (id text primary key, expires_at integer not null, token text not null unique, created_at integer not null, updated_at integer not null, ip_address text, user_agent text, user_id text not null);
--> statement-breakpoint
create table account (id text primary key, account_id text not null, provider_id text not null, user_id text not null, access_token text, refresh_token text, id_token text, access_token_expires_at integer, refresh_token_expires_at integer, scope text, password text, created_at integer not null, updated_at integer not null);
--> statement-breakpoint
create table verification (id text primary key, identifier text not null, value text not null, expires_at integer not null, created_at integer, updated_at integer);`

const secret = crypto.randomUUID() + crypto.randomUUID()
const password = crypto.randomUUID()
const base = 'http://localhost:3000'
const db = createDb({ schema, url: ':memory:', migrate: false })
const auth = createAuth({ db, secret, options: { database: drizzleAuth(db, schema), baseURL: base, rateLimit: { enabled: false } } })
const context = async ({ request }: { request: Request }) => ({ db, ...(await session(auth, request)) })

async function signUp(email: string) {
  const res = await auth.api.signUpEmail({ body: { name: email.split('@')[0]!, email, password }, asResponse: true })
  return { cookie: res.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), res }
}
const as = (cookie?: string, method = 'GET') => new Request(`${base}/`, { method, headers: cookie ? { cookie } : {} })

let cookie: string
beforeAll(async () => {
  await db.$weft.migrate([{ tag: 'auth', sql: ddl }])
  ;({ cookie } = await signUp('ada@example.test'))
})

const whoami = query({ $id: 'whoami', auth: 'user', run: ({ ctx }) => (ctx as Loose).user.email })
const signOutless = mutation({ $id: 'needsUser', auth: 'user', run: ({ ctx }) => (ctx as Loose).user.id })

test('session(): no cookie is null with no query; a cookie is the user', async () => {
  const spy = vi.spyOn(auth.api, 'getSession')
  expect(await session(auth, as())).toEqual({ user: null, session: null })
  expect(spy).not.toHaveBeenCalled()
  spy.mockRestore()
  const s = await session(auth, as(cookie))
  expect(s.user?.email).toBe('ada@example.test')
  expect(s.session?.userId).toBe(s.user?.id)
  expect((await session(auth, as('better-auth.session_token=forged'))).user).toBeNull()
})

test('auth: \'user\': A002 (401) with no session, the value with one, for queries and mutations', async () => {
  const anon = createScope(as(), { context })
  await expect(fetchQuery(anon, fnOf(whoami), undefined)).rejects.toMatchObject({ code: 'A002', extra: { status: 401 } })
  await expect(runMutation(createScope(as(undefined, 'POST'), { context }), fnOf(signOutless), undefined, [])).rejects.toMatchObject({ code: 'A002' })
  expect((await fetchQuery(createScope(as(cookie), { context }), fnOf(whoami), undefined)).v).toBe('ada@example.test')
})

test('A003: `auth: \'user\'` with a context that never called session()', async () => {
  await expect(fetchQuery(createScope(as(), { context: () => ({ db }) }), fnOf(whoami), undefined)).rejects.toMatchObject({ code: 'A003', extra: { status: 500 } })
})

test('a `scope: \'user\'` cache holds one value per user and answers no one nothing', async () => {
  const store = memoryStore()
  let runs = 0
  const mine = query({ $id: 'mine', cache: { life: 'minutes', scope: 'user' }, tags: ['mine'], run: ({ ctx }) => (runs++, (ctx as Loose).user?.email ?? 'nobody') })
  const other = (await signUp('bob@example.test')).cookie
  const get = (c?: string) => fetchQuery(createScope(as(c), { context, store }), fnOf(mine), undefined).then(e => e.v)
  expect(await get(cookie)).toBe('ada@example.test')
  expect(await get(other)).toBe('bob@example.test')
  expect(await get(cookie)).toBe('ada@example.test')
  expect(runs).toBe(2)
})

test('a plain cached query still can\'t read ctx.user (Q006)', async () => {
  const leak = query({ $id: 'leak', cache: { life: 'minutes' }, run: ({ ctx }: Loose) => ctx.user?.email })
  await expect(fetchQuery(createScope(as(cookie), { context, store: memoryStore() }), fnOf(leak), undefined)).rejects.toMatchObject({ code: 'Q006' })
})

test('forward(): cookies reach the response; a failure is an FnError with Better Auth\'s message and status', async () => {
  const headers = new Headers()
  const ctx = { request: as(), response: { headers } } as Loose
  const ok = await forward(ctx, auth.api.signInEmail({ body: { email: 'ada@example.test', password }, asResponse: true }))
  expect((ok as Loose).user.email).toBe('ada@example.test')
  expect(headers.getSetCookie().join()).toContain('session_token=')
  await expect(forward(ctx, auth.api.signInEmail({ body: { email: 'ada@example.test', password: 'wrong-password' }, asResponse: true }))).rejects.toMatchObject({ status: 401, message: expect.stringMatching(/invalid/i) })
})

test('createAuth exempts its tables from Q011 and keeps the app\'s options', () => {
  expect([...db.$weft.exempt].sort()).toEqual(['account', 'session', 'user', 'verification'])
  expect((auth.options as Loose).telemetry.enabled).toBe(false)
  expect((auth.options as Loose).baseURL).toBe(base)
})

test('A001: a short or missing secret on a production server; dev and tests pass', () => {
  const weak = createAuth({ db, secret: 'short', options: { database: drizzleAuth(db, schema), baseURL: base } })
  expect(() => weak.$weft.check()).not.toThrow()
  vi.stubEnv('NODE_ENV', 'production')
  try {
    expect(() => weak.$weft.check()).toThrow(StartError)
    expect(() => createAuth({ db, options: { database: drizzleAuth(db, schema), baseURL: base } }).$weft.check()).toThrow(/A001|secret/)
    expect(() => auth.$weft.check()).not.toThrow()
  } finally {
    vi.unstubAllEnvs()
  }
})

describe('the handler', () => {
  const ran: string[] = []
  const manifest: Manifest = {
    dir: 'src/routes',
    layouts: [{ id: 'layout:', file: 'root', dir: '' }, { id: 'layout:app', file: 'guard', dir: 'app', parent: 'layout:' }],
    routes: [{ id: '/app/page', file: 'page', layouts: ['layout:', 'layout:app'], pattern: '/app/page', params: [], kind: 'page' }, { id: '/login', file: 'login', layouts: ['layout:'], pattern: '/login', params: [], kind: 'page' }],
  }
  const Pass = (p: Loose) => p.children
  const modules: Loose = {
    root: { default: Pass },
    guard: { default: Pass, load: async ({ ctx }: Loose) => { ran.push('guard'); await new Promise(ok => { setTimeout(ok, 5) }); return ctx.user ?? redirect('/login') } },
    page: { default: () => 'page', load: () => { ran.push('page'); return {} } },
    login: { default: () => 'login' },
  }
  const found: { code: string; severity: string }[] = []
  const handler = createHandler({ manifest, modules, auth: auth as Loose, context, dev: true, onDiagnostic: d => found.push(d) })
  const call = (name: string, cookieHeader?: string) => handler(new Request(`${base}/_weft/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-weft': '1', ...(cookieHeader && { cookie: cookieHeader }) }, body: JSON.stringify({ i: { email: 'ada@example.test', password } }) }))
  mutation({ $id: 'login', run: ({ input, ctx }: Loose) => forward(ctx, auth.api.signInEmail({ body: input, headers: ctx.request.headers, asResponse: true })).then(() => redirect('/app/page')) })
  mutation({ $id: 'silentLogin', run: ({ input, ctx }: Loose) => forward(ctx, auth.api.signInEmail({ body: input, headers: ctx.request.headers, asResponse: true })).then(() => null) })

  test('a layout\'s redirect runs before its children, which never run', async () => {
    ran.length = 0
    const r = await handler.resolve('/app/page', as())
    expect(r.redirect?.href).toBe('/login')
    expect(ran).toEqual(['guard'])
    ran.length = 0
    const in_ = await handler.resolve('/app/page', as(cookie))
    expect(in_.redirect).toBeUndefined()
    expect(ran).toEqual(['guard', 'page'])
  })

  test('a mutation that changes the session and redirects is a full load, with its cookie', async () => {
    const res = await call('login')
    expect(await res.json()).toEqual({ r: '/app/page', x: 1 })
    expect(res.headers.getSetCookie().join()).toContain('session_token=')
  })

  test('A004: the session changed without a redirect', async () => {
    found.length = 0
    expect((await call('silentLogin')).status).toBe(200)
    expect(found.filter(d => d.code === 'A004')).toHaveLength(1)
  })

  test('auth\'s handler is mounted at its base path, with the socket\'s address stamped for rate limits', async () => {
    const res = await handler(new Request(`${base}/api/auth/get-session`, { headers: { cookie } }))
    expect(res.status).toBe(200)
    expect((await res.json()).user.email).toBe('ada@example.test')
  })
})

test('any provider that goes through forward counts as a session change, whatever its cookie is called', async () => {
  const headers = new Headers()
  await forward({ response: { headers } } as never, new Response('{}', { headers: { 'set-cookie': 'hand_session=x' } }))
  expect(sessionChanged(headers)).toBe(true)
  expect(sessionChanged(new Headers())).toBe(false)
})
