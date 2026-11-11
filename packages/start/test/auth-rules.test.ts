// `auth` on a server function: 'public', 'user', { role } and { can }, and the default for mutations in an app with auth.
import { expect, test } from 'vitest'
import { guard, signedIn } from '../src/exec'
import type { Context, Fn } from '../src/data'

const fn = (kind: Fn['kind'], auth?: Fn['def']['auth']) =>
  ({ kind, $id: `f.${kind}`, def: auth === undefined ? {} : { auth } }) as Fn
const as = (user?: { id: string; role?: unknown } | null) =>
  (user === undefined ? {} : { user }) as unknown as Context

test('a mutation that says nothing needs someone signed in, but only where ctx has a user field', async () => {
  await expect(guard(fn('mutation'), as(null))).rejects.toMatchObject({
    code: 'A002',
    extra: { status: 401 },
  })
  await expect(guard(fn('mutation'), as({ id: '1' }))).resolves.toBeUndefined()
  await expect(guard(fn('mutation'), as())).resolves.toBeUndefined() // an app without auth: open, as before
  await expect(guard(fn('query'), as(null))).resolves.toBeUndefined() // a query stays open unless it says
})

test("'public' opens a mutation to anyone, said out loud", async () => {
  await expect(guard(fn('mutation', 'public'), as(null))).resolves.toBeUndefined()
  expect(signedIn(fn('mutation', 'public'))).toBe(false)
  expect(signedIn(fn('query', 'user'))).toBe(true)
})

test('{ role } needs a signed-in user with one of the roles, from a string list or an array', async () => {
  const admin = fn('query', { role: 'admin' })
  await expect(guard(admin, as(null))).rejects.toMatchObject({ code: 'A002' })
  await expect(guard(admin, as({ id: '1', role: 'user' }))).rejects.toMatchObject({
    code: 'A006',
    extra: { status: 403 },
  })
  await expect(guard(admin, as({ id: '1', role: 'user, admin' }))).resolves.toBeUndefined()
  await expect(
    guard(fn('mutation', { role: ['owner', 'admin'] }), as({ id: '1', role: ['admin'] })),
  ).resolves.toBeUndefined()
  await expect(guard(admin, as({ id: '1' }))).rejects.toMatchObject({ code: 'A006' })
})

test('{ can } runs the check with ctx, async allowed', async () => {
  const mine = fn('mutation', { can: ({ user }) => Promise.resolve(user.id === '7') })
  await expect(guard(mine, as({ id: '7' }))).resolves.toBeUndefined()
  await expect(guard(mine, as({ id: '8' }))).rejects.toMatchObject({ code: 'A006' })
  await expect(guard(mine, as(null))).rejects.toMatchObject({ code: 'A002' })
  expect(signedIn(mine)).toBe(true)
})
