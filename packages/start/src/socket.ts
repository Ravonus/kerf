// The server's half of `channel` and `sharedState` (research 32 §4): one socket per tab, many joins. `attach` knows
// nothing about crossws, so the same code runs behind `/_kerf/ws` and behind @kerf-js/core/test's fake. A room is a hub channel
// (`kerf:c:<id>:<params>`), so rings, cursors, gaps and fan-out are the hub's, and a join listens before it replays.

import type { PublishOptions } from './channel'
import { enter, fns, isRedirect, runtime, stable, StartError, type Context } from './data'
import { createScope, type Scope } from './exec'
import { hub, type Ev, type Hub } from './hub'
import type { Join, Sock, Hubbed, Value } from './socket/types'
import { room, leaveRoom, store, VALUE } from './socket/rooms'
import { take, check, allowed, denied, channelContract } from './socket/check'
import { deliver } from './socket/deliver'
import { sharedWriter } from './socket/shared'
import { publish } from './socket/publish'
import { socketRouteWith } from './socket/route'
import { realtimeFault } from './server/realtime-fault'
import { SHARE, shareChannel } from './share-server'

/** A socket as this file needs it. `send` takes a whole frame. */
export interface Peer {
  send(text: string): void
  close(code: number, reason?: string): void
  backlog(): number
}

export interface Attached {
  message(text: string): void
  close(): void
  /** The session re-check, now. */
  recheck(): Promise<void>
}

/** A hub's sockets: a new hub (a dev reload, a test) starts empty. */
const states = new WeakMap<Hub, Hubbed>()

function stateOf(h: Hub): Hubbed {
  const s = states.get(h)
  if (s) return s
  const made: Hubbed = { socks: new Set(), rooms: new Map(), values: new Map() }
  states.set(h, made)
  h.closing.add(() => {
    for (const c of Array.from(made.socks)) gone(h, c, 1001)
  })
  h.watch((tags) => {
    for (const t of tags) {
      if (!t.startsWith('session:')) continue
      for (const c of made.socks) if (c.user === t.slice(8)) void recheck(h, c)
    }
  })
  return made
}

const unref = <T>(t: T) => ((t as { unref?(): void } | null | undefined)?.unref?.(), t)
const roomName = (id: string, params: unknown) => `kerf:c:${id}:${stable(params)}`
const SET = '$set'

const send = (c: Sock, out: unknown[]) => {
  c.peer.send(JSON.stringify(out))
  if (c.peer.backlog() > hub().limits.queue) gone(hub(), c, 1013)
}

const refuse = (c: Sock, n: number, operation: string, error: unknown) =>
  send(c, ['e', n, realtimeFault(c.options, error, operation)])

async function join(
  h: Hub,
  c: Sock,
  want: { n: number; id: string; params: unknown; cursor?: string | undefined },
) {
  const { n, id, params, cursor } = want
  const st = stateOf(h)
  if (c.joins.has(n) || typeof n !== 'number') return
  const fn = id === SHARE ? shareChannel(h) : fns.get(id)
  if (!channelContract(fn, h.shell, id === SHARE))
    return refuse(
      c,
      n,
      id,
      new StartError('Q009', `no channel \`${id}\` (the page is older than the server): reload`),
    )
  if (c.joins.size >= h.limits.subscriptions)
    return refuse(
      c,
      n,
      id,
      new StartError(
        'R009',
        `this socket already has ${h.limits.subscriptions} joins`,
        'join fewer rooms, or raise `limits.subscriptions`',
      ),
    )
  const j: Join = {
    n,
    fn,
    params,
    bucket: { tokens: h.limits.burst, at: Date.now() },
    chain: Promise.resolve(),
  }
  c.joins.set(n, j)
  try {
    j.params = await check(
      fn.kind === 'shared' ? fn.def.key : fn.def.params,
      params,
      `\`${id}\`'s params`,
    )
    if (!(await allowed(fn, c.ctx, j.params))) throw denied(fn)
  } catch (e) {
    c.joins.delete(n)
    return refuse(c, n, id, e)
  }
  if (j.gone) return
  const r = (j.room = room(h, st, roomName(id, j.params), fn.kind === 'shared'))
  const pending: Ev[] = []
  let live = false,
    lost = false
  // Listen, then replay: a message published in between can't be lost (R006's rule).
  j.on = (ev) => {
    if (!ev) return live ? send(c, ['r', n, h.position()]) : void (lost = true)
    if (live) deliver(c, j, h, ev, send)
    else pending.push(ev)
  }
  r.ch.listeners.add(j.on)
  try {
    await r.ch.ready
  } catch (e) {
    leave(h, c, j)
    const failure = new StartError(
      'E_RT',
      'The realtime bus is unavailable',
      undefined,
      { status: 503 },
      { cause: e },
    )
    return refuse(c, n, id, failure)
  }
  if (j.gone) return
  replayJoin(h, c, j, pending, { cursor, lost })
  live = true
  const v = st.values.get(r.name)
  if (fn.kind === 'shared' && v) send(c, ['m', n, h.position(), VALUE, v])
}

function replayJoin(
  h: Hub,
  c: Sock,
  j: Join,
  pending: Ev[],
  { cursor, lost }: { cursor?: string | undefined; lost: boolean },
) {
  const back = cursor ? h.replay(j.room!.ch, cursor) : []
  send(c, ['j', j.n, h.position()])
  if (!back || lost) {
    send(c, ['r', j.n, h.position()])
    return
  }
  const seen = new Set(back.map((e) => e.seq))
  for (const ev of [...back, ...pending.filter((e) => !seen.has(e.seq))].sort(
    (a, b) => a.seq - b.seq,
  ))
    deliver(c, j, h, ev, send)
}

function leave(h: Hub, c: Sock, j: Join) {
  j.gone = true
  c.joins.delete(j.n)
  if (j.room && j.on) {
    j.room.ch.listeners.delete(j.on)
    leaveRoom(h, stateOf(h), j.room)
    if (j.fn.def.left) void left(c, j)
  }
}

const bound = (c: Sock, j: Join) => ({
  params: j.params,
  publish: (n: string, m: unknown, o?: PublishOptions) =>
    publish(j.fn, j.params, n, m, { ...o, from: c.k }),
})

/** To this connection, past the bus: only `share` uses it, and it has already picked who hears what. */
const reply = (h: Hub, c: Sock, j: Join) => (name: string, msg: unknown) => {
  if (!j.gone) send(c, ['m', j.n, h.position(), name, msg])
}

/** `def.left`, once per join that got in, however it ended. Nothing is listening for a failure, so it's reported. */
async function left(c: Sock, j: Join) {
  const scope: Scope = { ...createScope(c.request, c.options), ctx: () => Promise.resolve(c.ctx) }
  try {
    await enter(scope, () =>
      j.fn.def.left!({ id: c.k, ctx: c.ctx, params: j.params, room: bound(c, j) }),
    )
  } catch (e) {
    realtimeFault(c.options, e, j.fn.$id)
  }
}

/** A message from the client: validated, its handler run in a fresh scope, the ack sent. In order within a join. */
async function run(h: Hub, c: Sock, j: Join, call: { ack: number; name: string; msg: unknown }) {
  const { ack, name, msg } = call
  const fn = j.fn
  try {
    if (fn.kind === 'shared') {
      if (name !== SET) throw new StartError('Q002', `\`${fn.$id}\` takes no message \`${name}\``)
      const v = await check(fn.def.value, msg, `\`${fn.$id}\`'s value`)
      if (!(await allowed(fn, c.ctx, j.params, true))) throw denied(fn)
      const st = stateOf(h),
        key = j.room!.name
      const stamp: Value = {
        v,
        at: Math.max(Date.now(), (st.values.get(key)?.at ?? 0) + 1),
        o: h.epoch,
      }
      store(st, key, stamp)
      await h.bus.publish(key, JSON.stringify({ f: c.k, n: VALUE, m: stamp }))
    } else {
      const schema = Object.hasOwn(fn.def.client ?? {}, name) ? fn.def.client![name] : undefined
      const handler = Object.hasOwn(fn.def.on ?? {}, name) ? fn.def.on![name] : undefined
      if (!schema || !handler)
        throw new StartError(
          'Q002',
          `\`${fn.$id}\` takes no message \`${name}\``,
          'name one of `client`, with a handler in `on`',
        )
      const valid = await check(schema, msg, `\`${fn.$id}.${name}\``)
      const scope: Scope = {
        ...createScope(c.request, c.options),
        ctx: () => Promise.resolve(c.ctx),
      }
      await enter(scope, () =>
        handler({
          msg: valid,
          id: c.k,
          ctx: c.ctx,
          params: j.params,
          room: bound(c, j),
          reply: reply(h, c, j),
        } as never),
      )
    }
    if (!j.gone) send(c, ['a', j.n, ack])
  } catch (e) {
    if (isRedirect(e)) return void (!j.gone && send(c, ['a', j.n, ack]))
    if (!j.gone) send(c, ['a', j.n, ack, realtimeFault(c.options, e, fn.$id)])
  }
}

function slow(h: Hub, c: Sock, what: string) {
  c.options.onDiagnostic?.({
    code: 'R008',
    severity: 'error',
    message: `R008: a client sent over ${what}`,
  })
  return gone(h, c, 1008, 'rate limit')
}

function frame(h: Hub, c: Sock, text: string) {
  if (!stateOf(h).socks.has(c)) return // closing: what was already on the wire
  c.last = Date.now()
  if (text.length > h.limits.body) {
    c.options.onDiagnostic?.({
      code: 'R008',
      severity: 'error',
      message: `R008: a channel frame of ${text.length} bytes; the limit is ${h.limits.body}`,
    })
    return gone(h, c, 1009, 'too big')
  }
  let f: unknown
  try {
    f = JSON.parse(text)
  } catch {
    return gone(h, c, 1007, 'not JSON')
  }
  if (!Array.isArray(f)) return gone(h, c, 1007, 'not a frame')
  if (f[0] === 'p') return send(c, ['p'])
  if (!take(c.bucket, h.limits.perSecond, h.limits.burst)) {
    return slow(h, c, `${h.limits.perSecond} messages a second`)
  }
  if (f[0] === 'j' && typeof f[2] === 'string')
    return void join(h, c, {
      n: f[1],
      id: f[2],
      params: f[3],
      cursor: typeof f[4] === 'string' ? f[4] : undefined,
    }).catch((error) => refuse(c, f[1], f[2], error))
  const j = c.joins.get(f[1])
  if (f[0] === 'l') return j && leave(h, c, j)
  if (f[0] !== 'm' || typeof f[2] !== 'number' || typeof f[3] !== 'string') return
  if (!j) return send(c, ['a', f[1], f[2], { code: 'R025', message: 'not joined' }])
  const per = j.fn.def.limits?.perSecond
  if (per && !take(j.bucket, per, per * 2)) {
    return slow(h, c, `${per} messages a second to \`${j.fn.$id}\``)
  }
  j.chain = j.chain.then(() => run(h, c, j, { ack: f[2], name: f[3], msg: f[4] }))
}

function gone(h: Hub, c: Sock, code: number, reason?: string) {
  const st = stateOf(h)
  if (!st.socks.delete(c)) return
  for (const t of c.timers) clearTimeout(t)
  for (const j of Array.from(c.joins.values())) leave(h, c, j)
  c.peer.close(code, reason)
}

/** The session again: `ctx`, then `authorize` for every join. A user who's gone closes the socket; 4401 tells the client. */
async function recheck(h: Hub, c: Sock) {
  const ctx = await createScope(c.request, c.options)
    .ctx()
    .catch(() => ({}) as Context)
  if (!stateOf(h).socks.has(c)) return
  if (c.user !== undefined && (ctx as { user?: { id?: string } }).user?.id !== c.user)
    return gone(h, c, 4401, 'session')
  c.ctx = ctx
  for (const j of Array.from(c.joins.values())) {
    if (await allowed(j.fn, ctx, j.params).catch(() => false)) {
      await j.fn.def.recheck?.({ id: c.k, ctx, reply: reply(h, c, j) })
      continue
    }
    leave(h, c, j)
    refuse(c, j.n, j.fn.$id, denied(j.fn))
  }
}

/** Open a channel socket. A mux line shares its socket's connection limit. */
export async function attach(
  peer: Peer,
  request: Request,
  scope: Scope,
  h = hub(),
  line = false,
): Promise<Attached> {
  const st = stateOf(h)
  const ctx = await scope.ctx()
  const user = (ctx as { user?: { id?: string } }).user?.id
  const c: Sock = {
    k: crypto.randomUUID(),
    peer,
    request,
    options: scope.options,
    ctx,
    user,
    joins: new Map(),
    bucket: { tokens: h.limits.burst, at: Date.now() },
    last: Date.now(),
    timers: [],
  }
  if (
    !line &&
    user !== undefined &&
    [...st.socks].filter((s) => s.user === user).length >= h.limits.connections
  ) {
    peer.close(1008, 'too many sockets')
    scope.options.onDiagnostic?.({
      code: 'R009',
      severity: 'error',
      message: `R009: user \`${user}\` already has ${h.limits.connections} sockets`,
    })
    return { message() {}, close() {}, recheck: async () => {} }
  }
  st.socks.add(c)
  send(c, ['h', { k: c.k, e: h.epoch, b: h.build ?? '' }])
  let ticks = 0
  const every = Math.max(1, Math.round(h.limits.session / h.limits.heartbeat))
  c.timers.push(
    unref(
      setInterval(() => {
        if (Date.now() - c.last > h.limits.heartbeat * 3) return gone(h, c, 1001, 'idle')
        if (++ticks % every === 0) void recheck(h, c)
      }, h.limits.heartbeat),
    ),
  )
  if (h.maxDuration)
    c.timers.push(
      unref(
        setTimeout(() => gone(h, c, 1012, 'max duration'), Math.max(1, h.maxDuration - 10) * 1000),
      ),
    )
  return {
    message: (text) => frame(h, c, text),
    close: () => gone(h, c, 1000),
    recheck: () => recheck(h, c),
  }
}

export { publish } from './socket/publish'

/** A shared value written by the server: `deckSlide.in(key).set(3)`. */
export const setShared = sharedWriter(stateOf)

runtime.channels = { publish, set: setShared }

/** Nitro reads `crossws` off the response (research 32 §1). A refusal is a hook that throws, so no socket opens. */
export function socketRoute(
  request: Request,
  scope: Scope,
  origins: string[] = [],
): Promise<Response> {
  return socketRouteWith(request, scope, origins, attach)
}
