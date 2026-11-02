// @vitest-environment jsdom
// `channel` and `sharedState` over @weft-js/core/test's fake socket (research 32 §7): the real socket.ts and hub, the real client,
// a memory bus, no sockets. `test/channel-ws.test.mjs` runs the protocol over a real WebSocket.
import { createRoot, defineState, state } from '@weft-js/core'
import { clock, flush, net, render, screen } from '@weft-js/core/test'
import { channel, sharedState, skip, StartError, type StandardSchemaV1 } from '@weft-js/start'
import { hub } from '@weft-js/start/hub'
import { keepOpen } from '../src/channel'

const any: StandardSchemaV1<any> = { '~standard': { version: 1, vendor: 't', validate: v => ({ value: v }) } }
const text: StandardSchemaV1<any, { text: string }> = { '~standard': { version: 1, vendor: 't', validate: (v: any) => (typeof v?.text === 'string' && v.text.length <= 8 ? { value: v } : { issues: [{ message: 'bad text' }] }) } }
const Msg: StandardSchemaV1<any, { id: number; text: string }> = { '~standard': { version: 1, vendor: 't', validate: (v: any) => (typeof v?.id === 'number' ? { value: v } : { issues: [{ message: 'no id' }] }) } }

let id = 0
let members: Record<string, string[]>
beforeEach(() => {
  id = 0
  members = { a: ['ann', 'bob'], b: ['bob'] }
})

const room = channel({
  $id: 'chat.room',
  params: any as StandardSchemaV1<any, { roomId: string }>,
  authorize: ({ ctx, params }) => !!members[params.roomId]?.includes((ctx as any).user?.id),
  client: { say: text, boom: any },
  server: { said: Msg, typing: any },
  on: {
    say: async ({ msg, room }) => { await room.publish('said', { id: ++id, text: msg.text }) },
    boom: () => { throw new Error('secret detail') },
  },
})

function Chat(props: { roomId: string }) {
  const chat = room.connect(() => ({ roomId: props.roomId }))
  const said = chat.collect('said', { max: 3, key: m => m.id })
  return (
    <>
      <p aria-label="status">{chat.status.value}</p>
      <ul>{said.value.map(m => <li key={m.id}>{m.text}</li>)}</ul>
      <button onClick={() => chat.send('say', { text: 'hi' }).catch(() => {})}>say</button>
    </>
  )
}
const status = () => screen.getByLabelText('status').textContent
const items = () => screen.queryAllByRole('listitem').map(li => li.textContent)
const say = () => screen.getByRole('button', { name: 'say' }).click()

describe('channel', () => {
  test('a client without `authorize` is R001, a stub is not', () => {
    expect(() => channel({ $id: 'no.auth', client: {} } as any)).toThrow(StartError)
    expect(() => channel({ $id: 'no.auth' } as any)).toThrow('R001')
    expect(() => channel({ $id: 'stub', $stub: 1 } as any)).not.toThrow()
    expect(() => sharedState('x', { key: any, value: any, initial: 0, authorize: { read: () => true } } as any)).toThrow('R001')
  })

  test('join, send, and the room\'s message comes back through the bus', async () => {
    net.context({ user: { id: 'ann' } })
    render(Chat, { roomId: 'a' })
    await net.settle()
    expect(status()).toBe('open')
    say()
    await net.settle()
    expect(items()).toEqual(['hi'])
    expect(net.sent(room)).toEqual([{ id: 'chat.room', name: 'say', msg: { text: 'hi' } }])
  })

  test('a user `authorize` refuses is unauthorized, and `send` rejects', async () => {
    net.context({ user: { id: 'eve' } })
    const seen: unknown[] = []
    function Probe() {
      const chat = room.connect({ roomId: 'a' })
      return <button onClick={() => chat.send('say', { text: 'x' }).catch(e => seen.push(e.code))}>{chat.status.value}</button>
    }
    render(Probe)
    await net.settle()
    expect(screen.getByRole('button').textContent).toBe('unauthorized')
    screen.getByRole('button').click()
    await net.settle()
    expect(seen).toEqual(['R011'])
    expect(net.sent()).toEqual([])
  })

  test('a bad message is refused with its issues, and nothing is published', async () => {
    net.context({ user: { id: 'ann' } })
    let error: any
    function Probe() {
      const chat = room.connect({ roomId: 'a' })
      const said = chat.collect('said')
      return <button onClick={() => chat.send('say', { text: 'much too long' }).catch(e => (error = e))}>{said.value.length}</button>
    }
    render(Probe)
    await net.settle()
    screen.getByRole('button').click()
    await net.settle()
    expect(error.code).toBe('Q002')
    expect(error.issues[0].message).toBe('bad text')
    expect(screen.getByRole('button').textContent).toBe('0')
  })

  test('a handler that throws answers plainly in production terms, and a name like `constructor` finds nothing', async () => {
    net.context({ user: { id: 'ann' } })
    const out: any[] = []
    let conn: any
    function Probe() {
      conn = room.connect({ roomId: 'a' })
      return <p />
    }
    render(Probe)
    await net.settle()
    await conn.send('constructor' as any, {}).catch((e: any) => out.push(e.code))
    await conn.send('toString' as any, {}).catch((e: any) => out.push(e.code))
    expect(out).toEqual(['Q002', 'Q002'])
  })

  test('collect keeps the last `max`, and `key` replaces a repeat', async () => {
    net.context({ user: { id: 'ann' } })
    render(Chat, { roomId: 'a' })
    await net.settle()
    for (const m of [{ id: 1, text: 'a' }, { id: 2, text: 'b' }, { id: 1, text: 'A' }, { id: 3, text: 'c' }, { id: 4, text: 'd' }]) await net.publish(room, { roomId: 'a' }, 'said', m)
    expect(items()).toEqual(['b', 'c', 'd'])
  })

  test('a message another user published reaches the reader; another room\'s does not', async () => {
    net.context({ user: { id: 'bob' } })
    render(Chat, { roomId: 'a' })
    await net.settle()
    await net.publish(room, { roomId: 'b' }, 'said', { id: 1, text: 'other' })
    await net.publish(room, { roomId: 'a' }, 'said', { id: 2, text: 'here' })
    expect(items()).toEqual(['here'])
  })

  test('a published message of the wrong shape is C002 in tests', async () => {
    net.context({ user: { id: 'ann' } })
    render(Chat, { roomId: 'a' })
    await net.settle()
    await expect(net.publish(room, { roomId: 'a' }, 'said', { text: 'no id' })).rejects.toThrow('C002')
    await expect(net.publish(room, { roomId: 'a' }, 'nope', {})).rejects.toThrow('C002')
  })

  test('a drop resumes: what was published meanwhile arrives once, and the list is kept', async () => {
    net.context({ user: { id: 'ann' } })
    render(Chat, { roomId: 'a' })
    await net.settle()
    await net.publish(room, { roomId: 'a' }, 'said', { id: 1, text: 'one' })
    const ch = hub().channel(`weft:c:chat.room:${JSON.stringify({ roomId: 'a' })}`)
    const seq = ch.ring.length
    await net.drop()
    expect(net.reconnects()).toBe(1)
    expect(status()).toBe('open')
    await net.publish(room, { roomId: 'a' }, 'said', { id: 2, text: 'two' })
    expect(items()).toEqual(['one', 'two'])
    expect(ch.ring.length).toBe(seq + 1)
  })

  test('a message published while the socket is down is replayed on the rejoin', async () => {
    net.context({ user: { id: 'ann' } })
    render(Chat, { roomId: 'a' })
    await net.settle()
    await net.publish(room, { roomId: 'a' }, 'said', { id: 1, text: 'one' })
    const name = `weft:c:chat.room:${JSON.stringify({ roomId: 'a' })}`
    await net.offline()
    await hub().bus.publish(name, JSON.stringify({ n: 'said', m: { id: 2, text: 'gap' } }))
    await flush()
    await net.online()
    await net.settle()
    expect(status()).toBe('open')
    expect(items()).toEqual(['one', 'gap'])
  })

  test('out of the window: `collect` empties, `resets` ticks, onReset fires', async () => {
    net.context({ user: { id: 'ann' } })
    const fired = vi.fn()
    let conn: any
    function Probe() {
      conn = room.connect({ roomId: 'a' })
      conn.onReset(fired)
      const said = conn.collect('said')
      return <p aria-label="n">{said.value.length}</p>
    }
    render(Probe)
    await net.settle()
    await net.publish(room, { roomId: 'a' }, 'said', { id: 1, text: 'one' })
    expect(screen.getByLabelText('n').textContent).toBe('1')
    await net.offline()
    hub().channel(`weft:c:chat.room:${JSON.stringify({ roomId: 'a' })}`).floor = Number.MAX_SAFE_INTEGER
    await net.online()
    await net.settle()
    expect(fired).toHaveBeenCalledTimes(1)
    expect(conn.resets.value).toBe(1)
    expect(screen.getByLabelText('n').textContent).toBe('0')
  })

  test('a send in flight when the socket dies rejects; one sent while down waits for the rejoin', async () => {
    net.context({ user: { id: 'ann' } })
    let conn: any
    const slow = channel({
      $id: 'chat.slow', authorize: () => true,
      client: { hold: any, go: any }, server: {},
      on: { hold: () => new Promise(() => {}), go: () => {} },
    })
    function Probe() {
      conn = slow.connect()
      return <p />
    }
    render(Probe)
    await net.settle()
    const lost = conn.send('hold', {}).catch((e: Error) => e.message)
    await flush()
    await net.drop()
    expect(await lost).toContain('may or may not')
    await net.offline()
    const later = conn.send('go', {})
    await net.online()
    await net.settle()
    await expect(later).resolves.toBeUndefined()
  })

  test('session re-check: a user gone is 4401, a user no longer a member is refused', async () => {
    net.context({ user: { id: 'ann' } })
    render(Chat, { roomId: 'a' })
    await net.settle()
    members.a = ['bob']
    await net.session({ user: { id: 'ann' } })
    expect(status()).toBe('unauthorized')
  })

  test('a signed-out user loses the socket, and rejoining is refused', async () => {
    net.context({ user: { id: 'ann' } })
    render(Chat, { roomId: 'a' })
    await net.settle()
    await net.session({})
    await net.settle()
    expect(status()).toBe('unauthorized')
    expect(net.reconnects()).toBe(1)
  })

  test('a poke of `session:<user>` re-checks at once', async () => {
    net.context({ user: { id: 'ann' } })
    render(Chat, { roomId: 'a' })
    await net.settle()
    members.a = []
    await hub().poke(['session:ann'])
    await new Promise(ok => setTimeout(ok))
    await net.settle()
    expect(status()).toBe('unauthorized')
  })

  test('two readers share one join, and a remount within `keep` finds the messages', async () => {
    net.context({ user: { id: 'ann' } })
    const first = render(Chat, { roomId: 'a' })
    render(Chat, { roomId: 'a' })
    await net.settle()
    await net.publish(room, { roomId: 'a' }, 'said', { id: 1, text: 'one' })
    expect(hub().bus.name).toBe('memory')
    first.unmount()
    render(Chat, { roomId: 'a' })
    await net.settle()
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['one', 'one'])
  })

  test('`skip` leaves, a new param moves the reader', async () => {
    net.context({ user: { id: 'bob' } })
    const id = state<string | null>(null)
    let chat: any
    function Probe() {
      chat = room.connect(() => (id.value ? { roomId: id.value } : skip))
      return <p aria-label="status">{chat.status.value}</p>
    }
    render(Probe)
    await net.settle()
    expect(status()).toBe('closed')
    id.value = 'a'
    await net.settle()
    expect(status()).toBe('open')
    id.value = 'b'
    await net.settle()
    expect(status()).toBe('open')
  })

  test('outside an owner is W051; T012 sees a connect left open', async () => {
    expect(() => room.connect({ roomId: 'a' })).toThrow('W051')
    net.context({ user: { id: 'ann' } })
    let close!: () => void
    createRoot(dispose => {
      close = dispose
      room.connect({ roomId: 'a' })
    })
    await net.settle()
    const { leaks } = await import('@weft-js/core/test')
    expect(leaks().join()).toContain('chat.room')
    close()
  })

  test('over the rate limit closes the socket, and the client reconnects', async () => {
    net.context({ user: { id: 'ann' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let conn: any
    function Probe() {
      conn = room.connect({ roomId: 'a' })
      return <p />
    }
    render(Probe)
    await net.settle()
    await Promise.allSettled(Array.from({ length: 60 }, () => conn.send('say', { text: 'x' })))
    await net.settle()
    expect(net.reconnects()).toBe(1)
    expect(warn.mock.calls.flat().join()).toContain('R008')
    warn.mockRestore()
  })

  test('the fake clock: no timers fire on their own', async () => {
    clock.install()
    net.context({ user: { id: 'ann' } })
    render(Chat, { roomId: 'a' })
    await net.settle()
    await clock.advance(60_000)
    expect(status()).toBe('open')
  })
})

describe('sharedState', () => {
  let writers: string[]
  beforeEach(() => { writers = ['ann'] })
  const slide = sharedState('deck', {
    $id: 'deck.slide', key: any as StandardSchemaV1<any, string>, value: any as StandardSchemaV1<any, number>, initial: 0,
    authorize: { read: ({ ctx }) => !!(ctx as any).user, write: ({ ctx }) => writers.includes((ctx as any).user?.id) },
  })
  const meeting = defineState('meeting', () => {
    const value = slide.connect('d1')
    return { value, next() { value.value += 1 } }
  })
  function Deck() {
    return (
      <>
        <p aria-label="slide">{meeting.value.value}</p>
        <p aria-label="status">{meeting.value.status.value}</p>
        <button onClick={() => meeting.next()}>next</button>
      </>
    )
  }
  const shown = () => screen.getByLabelText('slide').textContent

  test('starts at `initial`, a write is optimistic, sent and echoed', async () => {
    net.context({ user: { id: 'ann' } })
    render(Deck)
    await net.settle()
    expect(shown()).toBe('0')
    screen.getByRole('button').click()
    await flush()
    expect(shown()).toBe('1')
    await net.settle()
    expect(shown()).toBe('1')
    expect(net.sent(slide)).toEqual([{ id: 'deck.slide', name: '$set', msg: 1 }])
  })

  test('a refused write goes back to the server value and sets `error`', async () => {
    net.context({ user: { id: 'bob' } })
    render(Deck)
    await net.settle()
    screen.getByRole('button').click()
    await flush()
    await net.settle()
    expect(shown()).toBe('0')
    expect((meeting.value.error as any).code).toBe('R011')
  })

  test('a later reader gets the value, and a server write reaches it', async () => {
    net.context({ user: { id: 'ann' } })
    render(Deck)
    await net.settle()
    screen.getByRole('button').click()
    await flush()
    await net.settle()
    await net.drop()
    expect(shown()).toBe('1')
    await slide.in('d1').set(9)
    await net.settle()
    expect(shown()).toBe('9')
  })

  test('it is a box in a scope: no `persist`, no undo, no scope write hook', async () => {
    net.context({ user: { id: 'ann' } })
    render(Deck)
    await net.settle()
    expect(meeting.$snapshot().value).toBe(0)
  })
})

describe('what multiplayer needs of a room', () => {
  const log: unknown[] = []
  const lively = channel({
    $id: 'chat.lively',
    params: any as StandardSchemaV1<any, { roomId: string }>,
    authorize: ({ ctx }) => (ctx as any).user?.id !== 'out',
    client: { me: any, only: any, gone: any },
    server: { hi: any, tick: any },
    on: {
      me: async ({ id, room }) => { await room.publish('hi', { id }, { to: id }) },
      only: async ({ msg, room }) => { await room.publish('hi', { id: 'nobody' }, { to: msg }) },
      gone: async ({ room }) => { await room.publish('tick', { n: 1 }, { volatile: true }) },
    },
    left: ({ id, params }) => void log.push({ id, params }),
  })
  function Lively(props: { on: boolean }) {
    const chat = lively.connect(() => (props.on ? { roomId: 'a' } : skip))
    const hi = chat.collect('hi')
    return (
      <>
        <p aria-label="status">{chat.status.value}</p>
        <p aria-label="room">{chat.room.value ?? 'none'}</p>
        <ul>{hi.value.map(m => <li key={m.id}>{m.id}</li>)}</ul>
        <button onClick={() => chat.send('me', {})}>me</button>
        <button onClick={() => chat.send('only', 'someone-else')}>only</button>
        <button onClick={() => chat.send('gone', {})}>tick</button>
      </>
    )
  }
  const click = async (name: string) => {
    screen.getByRole('button', { name }).click()
    await net.settle()
  }
  beforeEach(() => { log.length = 0 })

  test('a handler has the connection, `to` reaches only it, and `left` gets the same id', async () => {
    net.context({ user: { id: 'ann' } })
    render(Lively, { on: true })
    await net.settle()
    expect(screen.getByLabelText('room').textContent).toContain('chat.lively')
    await click('me')
    const id = items()[0]
    expect(id).toMatch(/\w{8}/)
    await click('only')
    expect(items()).toEqual([id])
    await net.drop()
    expect(log).toEqual([{ id, params: { roomId: 'a' } }])
  })

  test('`left` runs when `authorize` stops holding', async () => {
    net.context({ user: { id: 'ann' } })
    render(Lively, { on: true })
    await net.settle()
    await net.session({ user: { id: 'out' } }).catch(() => {})
    expect(log).toHaveLength(1)
  })

  test('a volatile message is delivered and kept out of the resume window', async () => {
    net.context({ user: { id: 'ann' } })
    const seen: unknown[] = []
    function Ticks() {
      const chat = lively.connect({ roomId: 'a' })
      chat.on('tick', m => seen.push(m))
      return <button onClick={() => chat.send('gone', {})}>tick</button>
    }
    render(Ticks, {})
    await net.settle()
    await click('tick')
    expect(seen).toEqual([{ n: 1 }])
    const ch = hub().channel('weft:c:chat.lively:{"roomId":"a"}')
    expect(ch.ring).toHaveLength(0)
  })
})

test('a hidden tab parks its socket, unless a sibling is looking (`share`)', async () => {
  clock.install()
  const open = channel({ $id: 'park.room', authorize: () => true })
  let conn!: ReturnType<typeof open.connect>
  const stop = createRoot(dispose => {
    conn = open.connect(undefined, { keep: 0 })
    return dispose
  })
  await net.settle()
  const hide = (hidden: boolean) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: hidden ? 'hidden' : 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  }
  let looking = true
  keepOpen.stay = () => looking
  hide(true)
  await clock.advance(300_000)
  await net.settle()
  flush()
  expect(conn.status.value).toBe('open')
  looking = false
  await clock.advance(300_000)
  await net.settle()
  flush()
  expect(conn.status.value).toBe('reconnecting')       // parked
  hide(false)
  await net.settle()
  keepOpen.stay = undefined
  delete (document as any).visibilityState
  stop()
  await clock.advance(30_000)
  clock.uninstall()
})
