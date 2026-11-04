// A hand-written provider: the exit check for research 34 §5. Scrypt passwords and random session tokens on Native's
// SQL, with nothing from Better Auth. It meets weft only through `defineAuth`.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { defineAuth } from '@weft-js/start/auth'
import { db } from '#/db/index.server'

interface User {
  id: string
  name: string
  email: string
}

const COOKIE = 'hand_session'
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
const hash = (password: string, salt = randomBytes(16).toString('hex')) =>
  `${salt}:${scryptSync(password, salt, 32).toString('hex')}`
const verify = (password: string, stored: string) => {
  const [salt, key] = stored.split(':')
  return timingSafeEqual(
    Buffer.from(hash(password, salt).split(':')[1], 'hex'),
    Buffer.from(key, 'hex'),
  )
}
const tokenOf = (request: Request) =>
  request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1]

async function start(user: User) {
  const token = randomBytes(32).toString('hex')
  const now = new Date().toISOString()
  await db.sql`insert into "session" (id, token, "userId", "expiresAt", "createdAt", "updatedAt") values (${crypto.randomUUID()}, ${token}, ${user.id}, ${new Date(Date.now() + 864e5).toISOString()}, ${now}, ${now})`
  return json({ user }, 200, { 'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax` })
}

export default defineAuth({
  async session(request) {
    const token = tokenOf(request)
    if (!token) return { user: null, session: null }
    const [user] =
      (await db.sql`select u.id, u.name, u.email from "session" s join "user" u on u.id = s."userId" where s.token = ${token} and s."expiresAt" > ${new Date().toISOString()}`) as unknown as User[]
    return user ? { user, session: { token } } : { user: null, session: null }
  },
  async handler(request) {
    const path = new URL(request.url).pathname.replace('/api/auth', '')
    if (path === '/ok') return json({ ok: true })
    const body =
      request.method === 'POST'
        ? ((await request.json().catch(() => ({}))) as Record<string, string>)
        : {}
    if (path === '/sign-up') {
      const [taken] = await db.sql`select id from "user" where email = ${body.email}`
      if (taken) return json({ code: 'TAKEN', message: 'That email is already registered' }, 422)
      const user = { id: crypto.randomUUID(), name: body.name, email: body.email }
      const now = new Date().toISOString()
      await db.sql`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values (${user.id}, ${user.name}, ${user.email}, ${0}, ${now}, ${now})`
      await db.sql`insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values (${crypto.randomUUID()}, ${user.id}, ${'hand'}, ${user.id}, ${hash(body.password)}, ${now}, ${now})`
      return start(user)
    }
    if (path === '/sign-in') {
      const [row] =
        (await db.sql`select u.id, u.name, u.email, a.password from "user" u join account a on a."userId" = u.id where u.email = ${body.email}`) as unknown as (User & {
          password: string
        })[]
      if (!row || !verify(body.password, row.password))
        return json({ code: 'INVALID', message: 'Invalid email or password' }, 401)
      return start({ id: row.id, name: row.name, email: row.email })
    }
    if (path === '/sign-out') {
      const token = tokenOf(request)
      if (token) await db.sql`delete from "session" where token = ${token}`
      return json({ ok: true }, 200, {
        'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
      })
    }
    return json({ message: 'Not found' }, 404)
  },
})
