// The session cookie cache and API tokens (research 28 §3): a page may answer from the signed cookie for its window, a
// write never does, and a token only opens the functions listed for it. Secrets and passwords are throwaway values made here.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { mutation, query, type Context } from '@weft-js/start'
import { enter, fnOf } from '@weft-js/start/data'
import { forward, session } from '../src/auth'
import { createAuth } from '../src/auth/better-auth'
import { drizzleAuth } from '../src/auth/drizzle'
import { createDb } from '../src/db/sqlite'
import { createHandler, type Manifest } from '../src/server'

type User = { id: string; email: string }
type Signed = Context & { user: User }
type Visitor = Context & { user?: User | null }
const idOf = (fn: unknown) => (fnOf(fn) as { $id: string }).$id

const when = (name: string) => integer(name, { mode: 'timestamp' }).notNull()
const user = sqliteTable('user', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull(),
  image: text(),
  createdAt: when('created_at'),
  updatedAt: when('updated_at'),
})
const sess = sqliteTable('session', {
  id: text().primaryKey(),
  expiresAt: when('expires_at'),
  token: text().notNull().unique(),
  createdAt: when('created_at'),
  updatedAt: when('updated_at'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull(),
})
const account = sqliteTable('account', {
  id: text().primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text(),
  password: text(),
  createdAt: when('created_at'),
  updatedAt: when('updated_at'),
})
const verification = sqliteTable('verification', {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: when('expires_at'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})
const jwks = sqliteTable('jwks', {
  id: text().primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: when('created_at'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  alg: text(),
  crv: text(),
})
const schema = { user, session: sess, account, verification, jwks }
const ddl = `create table user (id text primary key, name text not null, email text not null unique, email_verified integer not null, image text, created_at integer not null, updated_at integer not null);
--> statement-breakpoint
create table session (id text primary key, expires_at integer not null, token text not null unique, created_at integer not null, updated_at integer not null, ip_address text, user_agent text, user_id text not null);
--> statement-breakpoint
create table account (id text primary key, account_id text not null, provider_id text not null, user_id text not null, access_token text, refresh_token text, id_token text, access_token_expires_at integer, refresh_token_expires_at integer, scope text, password text, created_at integer not null, updated_at integer not null);
--> statement-breakpoint
create table verification (id text primary key, identifier text not null, value text not null, expires_at integer not null, created_at integer, updated_at integer);
--> statement-breakpoint
create table jwks (id text primary key, public_key text not null, private_key text not null, created_at integer not null, expires_at integer, alg text, crv text);`

const secret = crypto.randomUUID() + crypto.randomUUID()
const password = crypto.randomUUID()
const base = 'http://localhost:3000'
const db = createDb({ schema, url: ':memory:', migrate: false })
const database = drizzleAuth(db, schema)
const options = { database, baseURL: base, rateLimit: { enabled: false } }

const whoami = query({
  $id: 'cache.whoami',
  auth: 'user',
  run: ({ ctx }) => (ctx as Signed).user.email,
})
const writes: string[] = []
const write = mutation({
  $id: 'cache.write',
  auth: 'user',
  run: ({ ctx }) => (writes.push((ctx as Signed).user.id), (ctx as Signed).user.id),
})
const openQuery = query({
  $id: 'cache.open',
  auth: 'user',
  run: ({ ctx }) => ({ id: (ctx as Signed).user.id, email: (ctx as Signed).user.email }),
})
const openWrite = mutation({
  $id: 'cache.openWrite',
  auth: 'user',
  run: ({ ctx }) => (writes.push((ctx as Signed).user.id), (ctx as Signed).user.id),
})
const leaveNoAuth = query({
  $id: 'cache.noAuth',
  run: ({ ctx }) => (ctx as Visitor).user?.id ?? 'nobody',
})

const auth = createAuth({
  db,
  secret,
  options,
  api: { functions: () => [openQuery, openWrite, leaveNoAuth] },
})
const context = async ({ request }: { request: Request }) => ({
  db,
  ...(await session(auth, request)),
})
mutation({
  $id: 'cache.out',
  run: ({ ctx }) =>
    forward(ctx, auth.api.signOut({ headers: ctx.request.headers, asResponse: true })).then(
      () => null,
    ),
})
mutation({
  $id: 'cache.password',
  run: ({ ctx, input }) =>
    forward(
      ctx,
      auth.api.changePassword({
        body: input as never,
        headers: ctx.request.headers,
        asResponse: true,
      }),
    ).then(() => null),
})

const manifest: Manifest = {
  dir: 'src/routes',
  layouts: [{ id: 'layout:', file: 'root', dir: '' }],
  routes: [],
}
const handler = createHandler({
  manifest,
  modules: { root: { default: (p: { children?: unknown }) => p.children } },
  auth,
  context,
  dev: true,
})
const fnUrl = (fn: unknown, input?: unknown) =>
  `${base}/_weft/fn/${encodeURIComponent(idOf(fn))}${input === undefined ? '' : `?i=${encodeURIComponent(JSON.stringify(input))}`}`
const headersFor = (cookie?: string, bearer?: string) => ({
  ...(cookie && { cookie }),
  ...(bearer && { authorization: `Bearer ${bearer}` }),
})
const get = (fn: unknown, cookie?: string, bearer?: string) =>
  handler(new Request(fnUrl(fn), { headers: headersFor(cookie, bearer) }))
const post = (fn: unknown, cookie?: string, bearer?: string, body: object = {}) =>
  handler(
    new Request(fnUrl(fn), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-weft': '1', ...headersFor(cookie, bearer) },
      body: JSON.stringify(body),
    }),
  )

const jar = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
const line = (res: Response, name: string) =>
  res.headers.getSetCookie().findLast((c) => c.includes(`${name}=`))
const cleared = (c?: string) => !!c && (/max-age=0/i.test(c) || /^[^=]+=;/.test(c))
const revoke = (id: string) => db.delete(sess).where(eq(sess.userId, id))
let n = 0
async function fresh() {
  const email = `u${++n}@example.test`
  const res = await auth.api.signUpEmail({ body: { name: 'U', email, password }, asResponse: true })
  const cookie = jar(res)
  const { user: u } = await session(auth, new Request(base, { headers: { cookie } }))
  return { cookie, id: u!.id, email, res }
}
async function token(cookie: string) {
  const res = await auth.handler(new Request(`${base}/api/auth/token`, { headers: { cookie } }))
  return {
    res,
    token: (
      await res
        .clone()
        .json()
        .catch(() => null)
    )?.token as string,
  }
}
const payloadOf = (t: string) => JSON.parse(Buffer.from(t.split('.')[1]!, 'base64url').toString())

beforeAll(() => db.$weft.migrate([{ tag: 'auth', sql: ddl }]))
afterEach(() => vi.restoreAllMocks())

describe('the cookie cache', () => {
  test('on by default: compact, five minutes, HTTP-only, and the login cookie stays an opaque token', async () => {
    const { res } = await fresh()
    expect(auth.options.session.cookieCache).toEqual({
      enabled: true,
      maxAge: 300,
      strategy: 'compact',
    })
    const data = line(res, 'session_data')!
    expect(data).toMatch(/max-age=300/i)
    expect(data).toMatch(/httponly/i)
    const value = decodeURIComponent(line(res, 'session_token')!.split(';')[0]!.split('=')[1]!)
    expect(value.split('.').length).toBeLessThan(3)
  })

  test("a page reads no database; the same revoked session can't write, and its cookies go", async () => {
    const { cookie, id, email } = await fresh()
    await revoke(id)
    const page = await get(whoami, cookie)
    expect((await page.json()).v).toBe(email) // the row is gone, so only the cookie can have answered
    expect(page.headers.getSetCookie()).toEqual([])
    writes.length = 0
    const res = await post(write, cookie)
    expect(res.status).toBe(401)
    expect((await res.json()).e.code).toBe('A002')
    expect(writes).toEqual([])
    expect(cleared(line(res, 'session_token'))).toBe(true)
  })

  test('a mutation on a live session runs, and renews the cache', async () => {
    const { cookie, id } = await fresh()
    const res = await post(write, cookie)
    expect((await res.json()).v).toBe(id)
    expect(line(res, 'session_data')).toMatch(/max-age=300/i)
  })

  test('past the window a page reads the database and hands back a fresh cookie; a dead session is signed out', async () => {
    const { cookie, id, email } = await fresh()
    const later = Date.now() + 301_000
    vi.spyOn(Date, 'now').mockReturnValue(later)
    const page = await get(whoami, cookie)
    expect((await page.json()).v).toBe(email)
    const again = line(page, 'session_data')!
    expect(again).toMatch(/max-age=300/i)
    await revoke(id)
    const renewed = cookie
      .split('; ')
      .filter((c) => !c.includes('session_data'))
      .concat(again.split(';')[0]!)
      .join('; ')
    expect((await (await get(whoami, renewed)).json()).v).toBe(email) // the fresh cookie answers without the row
    const gone = await get(whoami, cookie)
    expect(gone.status).toBe(401)
    expect(cleared(line(gone, 'session_token'))).toBe(true)
  })

  test('a realtime request reads the database: its ctx outlives the request', async () => {
    const { cookie, id } = await fresh()
    await revoke(id)
    for (const path of ['/_weft/ws', '/_weft/rt', '/_weft/x/some/route'])
      expect(
        (await session(auth, new Request(base + path, { headers: { cookie } }))).user,
      ).toBeNull()
    expect(
      (await session(auth, new Request(base + '/_weft/data/a', { headers: { cookie } }))).user,
    ).not.toBeNull()
  })

  test('sign-out clears the cache cookie', async () => {
    const { cookie } = await fresh()
    const res = await post(fnOf({ ...fnOf(whoami), $id: 'cache.out' }), cookie)
    expect(
      cleared(
        res.headers
          .getSetCookie()
          .filter((c) => c.includes('session_data='))
          .at(-1),
      ),
    ).toBe(true)
    expect(
      cleared(
        res.headers
          .getSetCookie()
          .filter((c) => c.includes('session_token='))
          .at(-1),
      ),
    ).toBe(true)
  })

  test("a password change clears the cache cookie; revoking other sessions replaces it with the new session's", async () => {
    const { cookie } = await fresh()
    const next = crypto.randomUUID()
    const res = await post({ $id: 'cache.password' }, cookie, undefined, {
      i: { currentPassword: password, newPassword: next },
    })
    expect(res.status).toBe(200)
    expect(
      cleared(
        res.headers
          .getSetCookie()
          .filter((c) => c.includes('session_data='))
          .at(-1),
      ),
    ).toBe(true)
    const other = await fresh()
    const swapped = await post({ $id: 'cache.password' }, other.cookie, undefined, {
      i: { currentPassword: password, newPassword: next, revokeOtherSessions: true },
    })
    expect(swapped.status).toBe(200)
    expect(
      swapped.headers
        .getSetCookie()
        .filter((c) => c.includes('session_data='))
        .at(-1),
    ).toMatch(/max-age=300/i)
  })

  test("Better Auth's own session routes ignore the cache", async () => {
    const { cookie, id } = await fresh()
    await revoke(id)
    expect((await token(cookie)).res.status).toBe(401)
    await expect(
      auth.api.updateUser({ body: { name: 'New' }, headers: new Headers({ cookie }) }),
    ).rejects.toThrow(/unauthorized/i)
    expect((await db.select().from(user).where(eq(user.id, id)))[0]!.name).toBe('U')
  })

  test('overridable, and off means every read is the database', async () => {
    const other = createAuth({
      db,
      secret,
      options: { ...options, session: { expiresIn: 3600, cookieCache: { maxAge: 60 } } },
    })
    expect(other.options.session).toEqual({
      expiresIn: 3600,
      cookieCache: { enabled: true, maxAge: 60, strategy: 'compact' },
    })
    const off = createAuth({
      db,
      secret,
      options: { ...options, session: { cookieCache: { enabled: false } } },
    })
    const { cookie, id } = await fresh()
    await revoke(id)
    expect((await session(off, new Request(base, { headers: { cookie } }))).user).toBeNull()
  })
})

describe('a build', () => {
  // Better Auth reads NODE_ENV once, on import, so its production throw for the default secret can't fire here: this is what stops it.
  test('hands Better Auth a throwaway secret when it has none, and a server never gets one', () => {
    const noSecret = () => createAuth({ db, secret: undefined, options }).options.secret
    expect(noSecret()).toBeUndefined()
    process.env.WEFT_BUILD = '1'
    try {
      expect(noSecret()).toMatch(/.{32}/)
      expect(noSecret()).not.toBe(noSecret())
      expect(createAuth({ db, secret, options }).options.secret).toBe(secret)
    } finally {
      delete process.env.WEFT_BUILD
    }
  })
})

describe('a session read in another request', () => {
  test("leaves that response alone: a socket's cookies are not the poker's", async () => {
    const admin = await fresh(),
      victim = await fresh()
    await revoke(victim.id) // the read now has cookies to send back: the dead session's removal
    const headers = new Headers()
    await enter(
      {
        request: new Request(fnUrl(write), { method: 'POST', headers: { cookie: admin.cookie } }),
        headers,
      },
      () =>
        session(auth, new Request(base, { method: 'POST', headers: { cookie: victim.cookie } })),
    )
    expect(headers.getSetCookie()).toEqual([])
  })
})

describe('a session too big for one cookie', () => {
  test('sets no chunks, so its requests stay under the header limit, and reads the database', async () => {
    const email = `big${++n}@example.test`
    const res = await auth.api.signUpEmail({
      body: { name: 'B', email, password, image: 'A'.repeat(20_000) },
      asResponse: true,
    })
    expect(res.headers.getSetCookie().join().length).toBeLessThan(2000)
    const cookie = jar(res)
    expect(cookie).toContain('session_token=')
    expect((await session(auth, new Request(base, { headers: { cookie } }))).user?.email).toBe(
      email,
    )
  })
})

describe('API tokens', () => {
  test('a token lasts 15 minutes, carries no browser login, and verifies from the public JWKS alone', async () => {
    const { cookie, id } = await fresh()
    const { token: t } = await token(cookie)
    const keys = await (await auth.handler(new Request(`${base}/api/auth/jwks`))).json()
    expect(keys.keys[0].privateKey ?? keys.keys[0].d).toBeUndefined()
    const { payload, protectedHeader } = await jwtVerify(t, createLocalJWKSet(keys), {
      issuer: base,
      audience: base,
    })
    expect(payload.sub).toBe(id)
    expect(payload.exp! - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(900)
    expect(payload.exp! - Math.floor(Date.now() / 1000)).toBeGreaterThan(890)
    expect(protectedHeader.alg).toBe('EdDSA')
  })

  test('session reads never sign a JWT or send one', async () => {
    const { cookie } = await fresh()
    const res = await auth.api.getSession({
      headers: new Headers({ cookie }),
      query: { disableCookieCache: true },
      returnHeaders: true,
    })
    expect(res.headers.get('set-auth-jwt')).toBeNull()
  })

  test('a listed function takes a token, with auth still enforced', async () => {
    const { cookie, id, email } = await fresh()
    const { token: t } = await token(cookie)
    expect((await (await get(openQuery, undefined, t)).json()).v).toEqual({ id, email })
    writes.length = 0
    expect((await (await post(openWrite, undefined, t)).json()).v).toBe(id)
    expect(writes).toEqual([id])
    expect((await get(openQuery)).status).toBe(401)
    expect((await (await get(leaveNoAuth, undefined, 'nonsense')).json()).v).toBe('nobody')
  })

  test("a token opens nothing else: an unlisted function answers as if it weren't there", async () => {
    const { cookie } = await fresh()
    const { token: t } = await token(cookie)
    expect((await get(whoami, undefined, t)).status).toBe(401)
    expect((await post(write, undefined, t)).status).toBe(401)
    expect(
      (
        await session(
          auth,
          new Request(`${base}/some/page`, { headers: { authorization: `Bearer ${t}` } }),
        )
      ).user,
    ).toBeNull()
  })

  test("a listed mutation refreshes nothing for a token: an unlisted query can't ride along", async () => {
    const { cookie, email } = await fresh()
    const { token: t } = await token(cookie)
    const res = await post(openWrite, undefined, t, { f: [[idOf(whoami), null]] })
    expect(res.status).toBe(200)
    expect(await res.text()).not.toContain(email)
  })

  test('tampered, expired, wrong audience, wrong issuer and alg=none are refused', async () => {
    const { cookie, id } = await fresh()
    const { token: t } = await token(cookie)
    const [head, body, sig] = t.split('.')
    const claims = payloadOf(t)
    const forged = Buffer.from(
      JSON.stringify({ ...claims, sub: 'someone-else', id: 'someone-else' }),
    ).toString('base64url')
    const none = Buffer.from(
      JSON.stringify({
        alg: 'none',
        kid: JSON.parse(Buffer.from(head!, 'base64url').toString()).kid,
      }),
    ).toString('base64url')
    const sign = (payload: object) =>
      auth.api
        .signJWT({ body: { payload: { sub: id, sid: claims.sid, ...payload } } })
        .then((r: { token: string }) => r.token)
    const bad = {
      tampered: `${head}.${forged}.${sig}`,
      resigned: `${head}.${body}.${sig!.slice(0, -4)}AAAA`,
      none: `${none}.${forged}.`,
      noneSigned: `${none}.${body}.${sig}`,
      expired: await sign({ exp: Math.floor(Date.now() / 1000) - 60 }),
      audience: await sign({ aud: 'https://other.example.test' }),
      issuer: await sign({ iss: 'https://other.example.test' }),
    }
    expect((await (await get(openQuery, undefined, await sign({}))).json()).v.id).toBe(id) // the signer works: only the claim differs
    for (const [name, value] of Object.entries(bad))
      expect([name, (await get(openQuery, undefined, value)).status]).toEqual([name, 401])
    expect((await post(openWrite, undefined, bad.tampered)).status).toBe(401)
  })

  test('a bad token never falls back to the cookie beside it', async () => {
    const { cookie } = await fresh()
    expect((await get(openQuery, cookie, 'not.a.token')).status).toBe(401)
    expect((await get(openQuery, cookie)).status).toBe(200)
  })

  test("a revoked session can't mint a token; one it minted can still read, and can't write", async () => {
    const { cookie, id } = await fresh()
    const { token: t } = await token(cookie)
    await revoke(id)
    expect((await get(openQuery, undefined, t)).status).toBe(200)
    expect((await post(openWrite, undefined, t)).status).toBe(401)
  })

  test("a token can't write once its session has expired, though the row is still there", async () => {
    const { cookie, id } = await fresh()
    const { token: t } = await token(cookie)
    await db
      .update(sess)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sess.userId, id))
    expect((await post(openWrite, undefined, t)).status).toBe(401)
  })

  test('with no fixed URL no token is accepted: iss and aud would go unchecked', async () => {
    const { cookie } = await fresh()
    const url = process.env.BETTER_AUTH_URL
    delete process.env.BETTER_AUTH_URL
    try {
      const open = createAuth({
        db,
        secret,
        options: {
          database,
          rateLimit: { enabled: false },
          baseURL: { allowedHosts: ['localhost:3000'], fallback: base },
        },
        api: { functions: () => [openQuery] },
      })
      const res = await open.handler(new Request(`${base}/api/auth/token`, { headers: { cookie } }))
      const { token: t } = await res.json()
      expect(t).toBeTruthy()
      expect(
        (
          await session(
            open,
            new Request(fnUrl(openQuery), { headers: { authorization: `Bearer ${t}` } }),
          )
        ).user,
      ).toBeNull()
    } finally {
      if (url !== undefined) process.env.BETTER_AUTH_URL = url
    }
  })

  test('`api: false` serves no tokens and takes none', async () => {
    const off = createAuth({ db, secret, options, api: false })
    expect((await off.handler(new Request(`${base}/api/auth/jwks`))).status).toBe(404)
    expect(off.options.plugins.some((p) => p.id === 'jwt')).toBe(false)
  })

  test('audience and lifetime are overridable', async () => {
    const custom = createAuth({
      db,
      secret,
      options,
      api: { jwt: { audience: 'https://api.example.test', expirationTime: '5m' } },
    })
    const { cookie } = await fresh()
    const res = await custom.handler(new Request(`${base}/api/auth/token`, { headers: { cookie } }))
    const claims = payloadOf((await res.json()).token)
    expect(claims.aud).toBe('https://api.example.test')
    expect(claims.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(300)
  })
})
