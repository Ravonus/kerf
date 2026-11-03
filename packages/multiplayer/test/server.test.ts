// The server fragment on its own: what it stamps, what it refuses.
import type { Context, StandardSchemaV1 } from '@weft-js/start'
import { cursorSchema, multiplayer, roomId, signTicket, verifyTicket } from '../src/server'

const atString: StandardSchemaV1 = { '~standard': { version: 1, vendor: 't', validate: v => (typeof (v as { at?: unknown } | null)?.at === 'string' ? { value: v } : { issues: [{ message: 'no' }] }) } }

const setup = (o: Partial<Parameters<typeof multiplayer>[0]> = {}) => {
  const sent: [string, unknown, unknown][] = []
  const room = { params: {}, publish: (n: string, m: unknown, opt: unknown) => { sent.push([n, m, opt]); return Promise.resolve() } }
  const mp = multiplayer({ user: ({ ctx }) => ({ id: (ctx as unknown as { user: string }).user, name: 'Ana' }), ...o })
  const on = (name: keyof typeof mp.on, msg: unknown, id = 'k1') => (mp.on[name] as (args: object) => Promise<void>)({ msg, id, ctx: { user: 'ann' } as unknown as Context, params: {}, room })
  return { sent, room, mp, on }
}
const valid = (s: { '~standard': { validate: (v: unknown) => unknown } }, v: unknown) => s['~standard'].validate(v) as { issues?: unknown; value?: unknown }

test('hello tells the sender its id and the room who it is, from `user`', async () => {
  const { sent, on } = setup()
  await on('mp.hello', { state: { user: { id: 'forged' } } })
  expect(sent[0]).toEqual(['mp.you', { id: 'k1', ticket: undefined }, { to: 'k1', volatile: true }])
  expect(sent[1]![1]).toMatchObject({ id: 'k1', user: { id: 'ann', name: 'Ana' } })
  expect(sent[1]![2]).toEqual({ volatile: true, exceptSelf: true })
  expect(sent[2]![0]).toBe('mp.ask')
})

test('`user` runs once per connection', async () => {
  let calls = 0
  const { on } = setup({ user: () => (calls++, { id: 'x' }) })
  await on('mp.hello', { state: null })
  await on('mp.state', { state: 1 })
  expect(calls).toBe(1)
})

test('an answer goes to who asked, and only cursors and state are volatile', async () => {
  const { sent, on } = setup()
  await on('mp.answer', { to: 'k9', state: 1 })
  expect(sent[0]![2]).toEqual({ volatile: true, to: 'k9' })
  await on('mp.cursor', { x: 0.5, y: 0.5 })
  expect(sent[1]).toEqual(['mp.cursor', { id: 'k1', at: { x: 0.5, y: 0.5 } }, { volatile: true, exceptSelf: true }])
})

test('leaving tells the room, and forgets who it was', async () => {
  let calls = 0
  const { sent, on, mp, room } = setup({ user: () => (calls++, { id: 'x' }) })
  await on('mp.hello', { state: null })
  await mp.left({ id: 'k1', room })
  expect(sent.at(-1)).toEqual(['mp.gone', { id: 'k1' }, { volatile: true }])
  await on('mp.state', { state: 1 })
  expect(calls).toBe(2)
})

test('the schemas refuse what a client has no business sending', () => {
  const { mp } = setup({ relay: { ping: atString } })
  expect(valid(cursorSchema, { x: 9, y: 0 }).issues).toBeTruthy()
  expect(valid(cursorSchema, { x: 0.1, y: 0.1, a: 'x'.repeat(200) }).issues).toBeTruthy()
  expect(valid(cursorSchema, { x: 0.1, y: 0.1, extra: 1 }).value).toEqual({ x: 0.1, y: 0.1 })
  expect(valid(cursorSchema, null).value).toBeNull()
  expect(valid(mp.client['mp.hello'], { state: 'x'.repeat(5000) }).issues).toBeTruthy()
  expect(valid(mp.client['mp.relay'], { kind: 'constructor', data: {} }).issues).toBeTruthy()
  expect(valid(mp.client['mp.relay'], { kind: 'nope', data: {} }).issues).toBeTruthy()
  expect(valid(mp.client['mp.relay'], { kind: 'ping', data: {} }).value).toBeTruthy()
  expect(valid(mp.client['mp.signal'], { to: 'k', data: 'x'.repeat(20_000) }).issues).toBeTruthy()
})

test('a relay kind checks its own data', async () => {
  const { sent, on } = setup({ relay: { ping: atString } })
  await expect(on('mp.relay', { kind: 'ping', data: {} })).rejects.toThrow('refused')
  await on('mp.relay', { kind: 'ping', data: { at: 'a' } })
  expect(sent[0]).toEqual(['mp.relay', { id: 'k1', kind: 'ping', data: { at: 'a' } }, { exceptSelf: true }])
})

test('a ticket opens with its secret, only, and only in time', async () => {
  const good = await signTicket({ sub: 'k', exp: Math.floor(Date.now() / 1000) + 60 }, 's')
  expect((await verifyTicket(good, 's'))?.sub).toBe('k')
  expect(await verifyTicket(good, 'other')).toBeNull()
  expect(await verifyTicket(good.slice(0, -2) + 'xx', 's')).toBeNull()
  expect(await verifyTicket(await signTicket({ exp: 1 }, 's'), 's')).toBeNull()
  expect(await verifyTicket('junk', 's')).toBeNull()
})

test('a room name is stable, and says nothing', async () => {
  expect(await roomId({ id: 'secret' })).toBe(await roomId({ id: 'secret' }))
  expect(await roomId({ id: 'secret' })).not.toContain('secret')
})
