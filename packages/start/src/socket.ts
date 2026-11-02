// The server's half of `channel` and `sharedState` (research 32 §4): one socket per tab, many joins. `attach` knows
// nothing about crossws, so the same code runs behind `/_weft/ws` and behind weft/test's fake. A room is a hub channel
// (`weft:c:<id>:<params>`), so rings, cursors, gaps and fan-out are the hub's, and a join listens before it replays.
//
//   checks       the upgrade: exact Origin (a missing one is refused), a wildcard in `origins` (R004).
//   authorize    every join, and again every `limits.session` and on a poke of `session:<user>`. A gone user is 4401.
//   limits       frame size (1009), a token bucket per socket and per channel (1008), joins, sockets, send queue (1013).
//   shared state last writer wins by `(at, instance)`. Instances hold the value; a new listener asks on the bus.

import type { PublishOptions } from './channel'
import { enter, fns, FnError, isRedirect, runtime, stable, StartError, type Context, type Fn, type StandardSchemaV1 } from './data'
import { createScope, type Scope, type ScopeOptions } from './exec'
import { checkOrigins, hub, type Channel, type Ev, type Hub } from './hub'
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

interface Join { n: number; fn: Fn; params: unknown; room?: Room; on?: (ev: Ev | null) => void; bucket: Bucket; gone?: boolean; chain: Promise<unknown> }
interface Bucket { tokens: number; at: number }
interface Sock {
  k: string
  peer: Peer
  request: Request
  options: ScopeOptions
  ctx: Context
  user?: string
  joins: Map<number, Join>
  bucket: Bucket
  last: number
  timers: ReturnType<typeof setTimeout>[]
}
interface Room { name: string; ch: Channel; refs: number; shared: boolean; on: (ev: Ev | null) => void }
interface Value { v: unknown; at: number; o: string }
interface Hubbed { socks: Set<Sock>; rooms: Map<string, Room>; values: Map<string, Value> }

/** A hub's sockets: a new hub (a dev reload, a test) starts empty. */
const states = new WeakMap<Hub, Hubbed>()
const VALUES = 10_000

function stateOf(h: Hub): Hubbed {
  let s = states.get(h)
  if (s) return s
  const made: Hubbed = { socks: new Set(), rooms: new Map(), values: new Map() }
  states.set(h, made)
  h.closing.add(() => { for (const c of [...made.socks]) gone(h, c, 1001) })
  h.watch(tags => {
    for (const t of tags) {
      if (!t.startsWith('session:')) continue
      for (const c of made.socks) if (c.user === t.slice(8)) void recheck(h, c)
    }
  })
  return made
}

const unref = <T,>(t: T) => ((t as any)?.unref?.(), t)
const roomName = (id: string, params: unknown) => `weft:c:${id}:${stable(params)}`
const SET = '$set', VALUE = '$v', ASK = '$?'

function take(b: Bucket, perSecond: number, burst: number) {
  const now = Date.now()
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) * perSecond) / 1000)
  b.at = now
  if (b.tokens < 1) return false
  b.tokens--
  return true
}

async function check(schema: StandardSchemaV1 | undefined, value: unknown, what: string) {
  if (!schema) return value
  const r = await schema['~standard'].validate(value)
  if (!r.issues) return r.value
  throw new StartError('Q002', `${what} was refused: ${r.issues.map(i => i.message).join('; ')}`, 'send what the schema accepts', { status: 400, issues: r.issues.map(i => ({ message: i.message, path: i.path?.map(p => (typeof p === 'object' ? p.key : p)) })) })
}

const send = (c: Sock, frame: unknown[]) => {
  c.peer.send(JSON.stringify(frame))
  if (c.peer.backlog() > hub().limits.queue) gone(hub(), c, 1013)
}

const refuse = (c: Sock, n: number, e: { code?: string; message: string }) => send(c, ['e', n, { code: e.code, message: e.message }])

const allowed = async (fn: Fn, ctx: Context, params: unknown, write?: boolean): Promise<boolean> => {
  const a = fn.def.authorize
  return !!(await (fn.kind === 'shared' ? a[write ? 'write' : 'read']({ ctx, key: params }) : a({ ctx, params })))
}

const denied = (fn: Fn) => new StartError('R011', `\`${fn.$id}\`: \`authorize\` refused this client`, 'sign in, or check `authorize`')

/** Fan-out of a room's messages to one join. */
function deliver(c: Sock, j: Join, h: Hub, ev: Ev) {
  const m = (ev.p ??= JSON.parse(ev.raw)) as { f?: string; x?: 1; t?: string; n: string; m: unknown }
  if (m.n === ASK || (m.x && m.f === c.k) || (m.t && m.t !== c.k)) return
  send(c, ['m', j.n, h.cursorOf(ev.seq), m.n, m.m])
}

function room(h: Hub, st: Hubbed, name: string, shared: boolean): Room {
  let r = st.rooms.get(name)
  if (r) return r.refs++, r
  const ch = h.channel(name)
  const on = (ev: Ev | null) => {
    if (!ev || !shared) return
    const m = (ev.p ??= JSON.parse(ev.raw)) as { n: string; m: any }
    if (m.n === VALUE) store(st, name, m.m)
    else if (m.n === ASK) {
      const v = st.values.get(name)
      if (v) void h.bus.publish(name, JSON.stringify({ n: VALUE, m: v }))
    }
  }
  ch.listeners.add(on)
  r = { name, ch, refs: 1, shared, on }
  st.rooms.set(name, r)
  if (shared && !st.values.has(name)) void ch.ready.then(() => h.bus.publish(name, JSON.stringify({ n: ASK })))
  return r
}

function leaveRoom(h: Hub, st: Hubbed, r: Room) {
  if (--r.refs) return
  st.rooms.delete(r.name)
  h.unlisten(r.ch, r.on)
}

function store(st: Hubbed, name: string, v: Value) {
  const had = st.values.get(name)
  if (had && (had.at > v.at || (had.at === v.at && had.o >= v.o))) return
  st.values.delete(name) // last in the map: the oldest key goes first
  st.values.set(name, v)
  if (st.values.size > VALUES) st.values.delete(st.values.keys().next().value!)
}

async function join(h: Hub, c: Sock, n: number, id: string, params: unknown, cursor?: string) {
  const st = stateOf(h)
  if (c.joins.has(n) || typeof n !== 'number') return
  const fn = id === SHARE ? shareChannel(h) : fns.get(id)
  if (fn?.kind !== 'channel' && fn?.kind !== 'shared') return refuse(c, n, new StartError('Q009', `no channel \`${id}\` (the page is older than the server): reload`))
  if (c.joins.size >= h.limits.subscriptions) return refuse(c, n, new StartError('R009', `this socket already has ${h.limits.subscriptions} joins`, 'join fewer rooms, or raise `limits.subscriptions`'))
  const j: Join = { n, fn, params, bucket: { tokens: h.limits.burst, at: Date.now() }, chain: Promise.resolve() }
  c.joins.set(n, j)
  try {
    j.params = await check(fn.kind === 'shared' ? fn.def.key : fn.def.params, params, `\`${id}\`'s params`)
    if (!(await allowed(fn, c.ctx, j.params))) throw denied(fn)
  } catch (e) {
    c.joins.delete(n)
    return refuse(c, n, known(c, id, e))
  }
  if (j.gone) return
  const name = roomName(id, j.params)
  const r = (j.room = room(h, st, name, fn.kind === 'shared'))
  const pending: Ev[] = []
  let live = false, lost = false
  // Listen, then replay: a message published in between can't be lost (R006's rule).
  j.on = ev => {
    if (!ev) return live ? void send(c, ['r', n, h.position()]) : void (lost = true)
    if (live) deliver(c, j, h, ev)
    else pending.push(ev)
  }
  r.ch.listeners.add(j.on)
  try {
    await r.ch.ready
  } catch (e) {
    leave(h, c, j)
    return refuse(c, n, new StartError('R011', `\`${id}\`: the bus is down`, undefined))
  }
  if (j.gone) return
  const back = cursor ? h.replay(r.ch, cursor) : []
  send(c, ['j', n, h.position()])
  if (!back || lost) {
    send(c, ['r', n, h.position()])
    pending.length = 0
  } else {
    const seen = new Set(back.map(e => e.seq))
    for (const ev of [...back, ...pending.filter(e => !seen.has(e.seq))].sort((a, b) => a.seq - b.seq)) deliver(c, j, h, ev)
  }
  live = true
  const v = st.values.get(name)
  if (fn.kind === 'shared' && v) send(c, ['m', n, h.position(), VALUE, v])
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

const bound = (c: Sock, j: Join) => ({ params: j.params, publish: (n: string, m: unknown, o?: PublishOptions) => publish(j.fn, j.params, n, m, { ...o, from: c.k }) })

/** To this connection, past the bus: only `share` uses it, and it has already picked who hears what. */
const reply = (h: Hub, c: Sock, j: Join) => (name: string, msg: unknown) => { if (!j.gone) send(c, ['m', j.n, h.position(), name, msg]) }

/** `def.left`, once per join that got in, however it ended. Nothing is listening for a failure, so it's reported. */
async function left(c: Sock, j: Join) {
  const scope: Scope = { ...createScope(c.request, c.options), ctx: async () => c.ctx }
  try {
    await enter(scope, () => j.fn.def.left({ id: c.k, ctx: c.ctx, params: j.params, room: bound(c, j) }))
  } catch (e) {
    known(c, j.fn.$id, e)
  }
}

const known = (c: Sock, id: string, e: unknown): { code?: string; message: string; issues?: unknown } => {
  if (e instanceof StartError || e instanceof FnError) return { code: e.code, message: e.message, ...(((e as any).extra?.issues ?? (e as any).issues) && { issues: (e as any).extra?.issues ?? (e as any).issues }) }
  c.options.onDiagnostic?.({ code: 'E_RT', severity: 'error', message: `${id}: ${e instanceof Error ? e.stack ?? e.message : String(e)}` })
  return { message: c.options.dev && e instanceof Error ? e.message : 'Message failed.' }
}

/** A message from the client: validated, its handler run in a fresh scope, the ack sent. In order within a join. */
async function run(h: Hub, c: Sock, j: Join, ack: number, name: string, msg: unknown) {
  const fn = j.fn
  try {
    if (fn.kind === 'shared') {
      if (name !== SET) throw new StartError('Q002', `\`${fn.$id}\` takes no message \`${name}\``)
      const v = await check(fn.def.value, msg, `\`${fn.$id}\`'s value`)
      if (!(await allowed(fn, c.ctx, j.params, true))) throw denied(fn)
      const st = stateOf(h), key = j.room!.name
      const stamp: Value = { v, at: Math.max(Date.now(), (st.values.get(key)?.at ?? 0) + 1), o: h.epoch }
      store(st, key, stamp)
      await h.bus.publish(key, JSON.stringify({ f: c.k, n: VALUE, m: stamp }))
    } else {
      const schema = Object.hasOwn(fn.def.client ?? {}, name) ? fn.def.client![name] : undefined
      const handler = Object.hasOwn(fn.def.on ?? {}, name) ? fn.def.on![name] : undefined
      if (!schema || !handler) throw new StartError('Q002', `\`${fn.$id}\` takes no message \`${name}\``, 'name one of `client`, with a handler in `on`')
      const valid = await check(schema, msg, `\`${fn.$id}.${name}\``)
      const scope: Scope = { ...createScope(c.request, c.options), ctx: async () => c.ctx }
      await enter(scope, () => handler({ msg: valid, id: c.k, ctx: c.ctx, params: j.params, room: bound(c, j), reply: reply(h, c, j) }))
    }
    if (!j.gone) send(c, ['a', j.n, ack])
  } catch (e) {
    if (isRedirect(e)) return void (!j.gone && send(c, ['a', j.n, ack]))
    if (!j.gone) send(c, ['a', j.n, ack, known(c, fn.$id, e)])
  }
}

function frame(h: Hub, c: Sock, text: string) {
  if (!stateOf(h).socks.has(c)) return // closing: what was already on the wire
  c.last = Date.now()
  if (text.length > h.limits.body) {
    c.options.onDiagnostic?.({ code: 'R008', severity: 'error', message: `R008: a channel frame of ${text.length} bytes; the limit is ${h.limits.body}` })
    return gone(h, c, 1009, 'too big')
  }
  let f: any[]
  try { f = JSON.parse(text) } catch { return gone(h, c, 1007, 'not JSON') }
  if (!Array.isArray(f)) return gone(h, c, 1007, 'not a frame')
  if (f[0] === 'p') return send(c, ['p'])
  if (!take(c.bucket, h.limits.perSecond, h.limits.burst)) {
    c.options.onDiagnostic?.({ code: 'R008', severity: 'error', message: `R008: a client sent over ${h.limits.perSecond} messages a second` })
    return gone(h, c, 1008, 'rate limit')
  }
  if (f[0] === 'j' && typeof f[2] === 'string') return void join(h, c, f[1], f[2], f[3], typeof f[4] === 'string' ? f[4] : undefined)
  const j = c.joins.get(f[1])
  if (f[0] === 'l') return void (j && leave(h, c, j))
  if (f[0] !== 'm' || typeof f[2] !== 'number' || typeof f[3] !== 'string') return
  if (!j) return send(c, ['a', f[1], f[2], { code: 'Q009', message: 'not joined' }])
  const per = j.fn.def.limits?.perSecond
  if (per && !take(j.bucket, per, per * 2)) {
    c.options.onDiagnostic?.({ code: 'R008', severity: 'error', message: `R008: a client sent over ${per} messages a second to \`${j.fn.$id}\`` })
    return gone(h, c, 1008, 'rate limit')
  }
  j.chain = j.chain.then(() => run(h, c, j, f[2], f[3], f[4]))
}

function gone(h: Hub, c: Sock, code: number, reason?: string) {
  const st = stateOf(h)
  if (!st.socks.delete(c)) return
  for (const t of c.timers) clearTimeout(t)
  for (const j of [...c.joins.values()]) leave(h, c, j)
  c.peer.close(code, reason)
}

/** The session again: `ctx`, then `authorize` for every join. A user who's gone closes the socket; 4401 tells the client. */
async function recheck(h: Hub, c: Sock) {
  const ctx = await createScope(c.request, c.options).ctx().catch(() => ({}) as Context)
  if (!stateOf(h).socks.has(c)) return
  if (c.user !== undefined && (ctx as { user?: { id?: string } }).user?.id !== c.user) return gone(h, c, 4401, 'session')
  c.ctx = ctx
  for (const j of [...c.joins.values()]) {
    if (await allowed(j.fn, ctx, j.params).catch(() => false)) {
      await j.fn.def.recheck?.({ id: c.k, ctx, reply: reply(h, c, j) })
      continue
    }
    leave(h, c, j)
    refuse(c, j.n, denied(j.fn))
  }
}

/** Open: the hello, the heartbeat watch and the session timer. */
/** `line`: one tab on a shared socket (mux.ts), which `limits.connections` counted already. */
export async function attach(peer: Peer, request: Request, scope: Scope, h = hub(), line = false): Promise<Attached> {
  const st = stateOf(h)
  const ctx = await scope.ctx()
  const user = (ctx as { user?: { id?: string } }).user?.id
  const c: Sock = { k: crypto.randomUUID(), peer, request, options: scope.options, ctx, user, joins: new Map(), bucket: { tokens: h.limits.burst, at: Date.now() }, last: Date.now(), timers: [] }
  if (!line && user !== undefined && [...st.socks].filter(s => s.user === user).length >= h.limits.connections) {
    peer.close(1008, 'too many sockets')
    scope.options.onDiagnostic?.({ code: 'R009', severity: 'error', message: `R009: user \`${user}\` already has ${h.limits.connections} sockets` })
    return { message() {}, close() {}, recheck: async () => {} }
  }
  st.socks.add(c)
  send(c, ['h', { k: c.k, e: h.epoch, b: h.build ?? '' }])
  let ticks = 0
  const every = Math.max(1, Math.round(h.limits.session / h.limits.heartbeat))
  c.timers.push(unref(setInterval(() => {
    if (Date.now() - c.last > h.limits.heartbeat * 3) return gone(h, c, 1001, 'idle')
    if (++ticks % every === 0) void recheck(h, c)
  }, h.limits.heartbeat)))
  if (h.maxDuration) c.timers.push(unref(setTimeout(() => gone(h, c, 1012, 'max duration'), Math.max(1, h.maxDuration - 10) * 1000)))
  return { message: text => frame(h, c, text), close: () => gone(h, c, 1000), recheck: () => recheck(h, c) }
}

/** `room.publish` and `room.in(params).publish`. */
export async function publish(fn: Fn, params: unknown, name: string, message: unknown, o: PublishOptions & { from?: string } = {}) {
  const h = hub()
  const valid = await check(fn.kind === 'shared' ? fn.def.key : fn.def.params, params, `\`${fn.$id}\`'s params`)
  if (h.dev) {
    const schema = Object.hasOwn(fn.def.server ?? {}, name) ? fn.def.server![name] : undefined
    if (!schema) throw new StartError('C002', `\`${fn.$id}\` has no server message \`${name}\``, 'add it to `server`', { status: 500 })
    const r = await schema['~standard'].validate(message)
    if (r.issues) throw new StartError('C002', `\`${fn.$id}.${name}\` was published with a message its schema rejects: ${r.issues.map(i => i.message).join('; ')}`, 'fix the message, or the schema', { status: 500 })
  }
  // `v` first: the hub reads it off the front of the string, to leave the ring alone.
  const raw = JSON.stringify({ ...(o.volatile && { v: 1 }), ...(o.from && { f: o.from }), ...(o.exceptSelf && { x: 1 }), ...(o.to && { t: o.to }), n: name, m: message })
  if (raw.length > h.limits.message) throw new StartError('R008', `a \`${fn.$id}\` message is ${raw.length} bytes; a message may be ${h.limits.message}`, 'publish less, or an id subscribers fetch')
  await h.bus.publish(roomName(fn.$id, valid), raw)
}

/** A shared value written by the server: `deckSlide.in(key).set(3)`. */
export async function setShared(fn: Fn, key: unknown, value: unknown) {
  const h = hub()
  const valid = await check(fn.def.key, key, `\`${fn.$id}\`'s key`)
  const v = await check(fn.def.value, value, `\`${fn.$id}\`'s value`)
  const st = stateOf(h), name = roomName(fn.$id, valid)
  const stamp: Value = { v, at: Math.max(Date.now(), (st.values.get(name)?.at ?? 0) + 1), o: h.epoch }
  store(st, name, stamp)
  await h.bus.publish(name, JSON.stringify({ n: VALUE, m: stamp }))
}

runtime.channels = { publish, set: setShared }

/** Nitro reads `crossws` off the response (research 32 §1). A refusal is a hook that throws, so no socket opens. */
export function socketRoute(request: Request, scope: Scope, origins: string[] = []): Promise<Response> {
  const hooks = (crossws: object) => Promise.resolve(Object.assign(new Response('Upgrade required', { status: 426 }), { crossws }))
  const refuse = (code: string, message: string, status: number) => {
    scope.options.onDiagnostic?.({ code, severity: 'error', message })
    return hooks({ upgrade() { throw new Response(message, { status }) } })
  }
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return Promise.resolve(new Response('Upgrade required', { status: 426, headers: { 'cache-control': 'no-store' } }))
  try {
    checkOrigins(origins)
  } catch (e) {
    return refuse('R004', (e as Error).message, 500)
  }
  const origin = request.headers.get('origin')
  if (!origin || (origin !== new URL(request.url).origin && !origins.includes(origin))) return refuse('R010', `R010: origin \`${origin ?? 'none'}\` may not open a socket: list it in \`realtime({ origins })\``, 403)
  const peers = new Map<string, Promise<Pick<Attached, 'message' | 'close'>>>()
  const mux = new URL(request.url).searchParams.has('mux')
  return hooks({
    open(peer: any) {
      const p: Peer = { send: t => void peer.send(t), close: (code, reason) => peer.close(code, reason), backlog: () => peer.websocket?.bufferedAmount ?? 0 }
      peers.set(peer.id, (mux ? import('./mux').then(m => m.muxed(p, request, scope)) : attach(p, request, scope)).catch(e => {
        scope.options.onDiagnostic?.({ code: 'E_RT', severity: 'error', message: `/_weft/ws: ${e instanceof Error ? e.stack ?? e.message : String(e)}` })
        peer.close(1011, 'context failed')
        return { message() {}, close() {} }
      }))
    },
    message(peer: any, m: any) { void peers.get(peer.id)?.then(a => a.message(m.text())) },
    close(peer: any) {
      void peers.get(peer.id)?.then(a => a.close())
      peers.delete(peer.id)
    },
  })
}
