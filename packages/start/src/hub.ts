// The server's realtime hub (research 30 §5). No runtime imports, so one hub runs behind `/_weft/rt` and behind
// weft/test's fake transport: both hand it a sink, and only the HTTP sink knows about bytes.
//
//   rings        one for pokes, always listening, so a rendered page's cursor can replay the gap before it connects;
//                one per topic channel, alive while someone listens and one window longer. Cursors are
//                `<epoch>:<seq>`: another epoch, or one older than a ring's floor, is out of the window.
//   connections  one per tab, changed in place (`k`), so adding a subscription never restarts another's `run`.
//   backpressure past the high-water mark a subscription holds its last message, or up to `buffer`; pokes merge by tag.
//                A buffer that overflows resets that stream; a connection over `queue` bytes is closed, and resumes.

import type { Bus } from './bus'
import { memoryBus } from './bus'
import { createFeed, functionHost, type Feed, type Poke, type Probe, type Source } from './changes'
import { currentScope, enter, fns, StartError, type Context, type Fn, type LiveMode, type StandardSchemaV1 } from './data'
import { createScope, defaultStore, guard, liveQueries, missedFeed, tagsOf, validate, type Scope, type ScopeOptions, type Store } from './exec'

export interface Limits {
  subscriptions: number
  /** Per signed-in user. */
  connections: number
  /** Bytes of one request (client→server). */
  body: number
  /** Bytes of one message (server→client). */
  message: number
  /** Bytes one connection may hold before it's closed. */
  queue: number
  /** Events a ring keeps. */
  ring: number
  /** Ms a ring keeps them. */
  window: number
  /** Ms between `: ping`s. */
  heartbeat: number
  /** Ms between session re-checks of `auth` subscriptions and channel joins. */
  session: number
  /** Channel messages a client may send per second, per socket. */
  perSecond: number
  /** The burst `perSecond` allows. */
  burst: number
}

const LIMITS: Limits = { subscriptions: 100, connections: 10, body: 64 * 1024, message: 1 << 20, queue: 1 << 20, ring: 256, window: 60_000, heartbeat: 20_000, session: 300_000, perSecond: 20, burst: 40 }
const HIGH = 64 * 1024
const VOLATILE = '{"v":1'

export interface RealtimeOptions {
  /** Default: `memoryBus()`, one instance only (R002). */
  bus?: Bus
  /** Origins allowed besides the app's own, exact: scheme, host and port. */
  origins?: string[]
  limits?: Partial<Limits>
  /** Seconds the platform lets a response live: streams end 10 s earlier, and the client resumes. */
  maxDuration?: number
  /** Writes from outside the app: `changes: dbChanges(db, [todos])`, or a source of your own. */
  changes?: Source
}

/** What the app gets from `configure`, beside `src/realtime.server.ts`. */
export interface HubOptions extends RealtimeOptions {
  build?: string
  dev?: boolean
  /** Queries marked `live: { required: true }`: without a real feed the server refuses to run (R015). */
  required?: string[]
  store?: Store
  onDiagnostic?: ScopeOptions['onDiagnostic']
}

/** What `.live` reports, and a health route reads. */
export interface LiveState {
  mode: LiveMode
  via: string
  why?: string
  fix?: string
  /** The feed works in general and is out right now. */
  down?: string
}

/** `src/realtime.server.ts`'s default export. */
export function realtime(options: RealtimeOptions): RealtimeOptions {
  checkOrigins(options.origins)
  return options
}

/** R004. `realtime()` is a wrapper an app can leave out, so the upgrade calls this too. */
export function checkOrigins(origins: string[] = []) {
  if (origins.some(o => o.includes('*'))) throw new StartError('R004', '`realtime({ origins })` has a wildcard: any site could read this app\'s streams and join its channels with a visitor\'s cookies', 'list the origins, scheme and port included')
}

/** Where a connection's frames go. `data` is JSON. */
export interface Sink {
  write(event: string, data: string): void
  ping?(): void
  /** Bytes written and not yet taken by the client. */
  backlog(): number
  close(): void
}

/** What the client sends (research 30 §4): `[n, kind, id, input, cursor, buffer]`. */
export type SubEntry = [n: number, kind: 'q' | 's', id: string, input: unknown, cursor?: string, buffer?: number]
export interface Body { k?: string; c?: string; s?: SubEntry[]; d?: number[] }

/** A message with its cursor: `yield tracked(row.id, row)`, and a resumed `run` gets it as `lastEventId`. */
export class Tracked<M> {
  constructor(public id: string, public value: M) {}
}
export const tracked = <M>(id: string, value: M) => new Tracked(id, value)

/** Thrown out of `run` when its cursor can't resume: the stream restarts without one. */
const RESET = Symbol('weft.reset')

export interface Ev { seq: number; at: number; raw: string; /** Parsed once, for every socket of a room. */ p?: any }
export interface Channel {
  name: string
  ring: Ev[]
  floor: number
  listeners: Set<(ev: Ev | null) => void>
  /** Take a message as if the bus had brought it: a change feed reaches this instance's connections only. */
  got: (raw: string) => void
  ready: Promise<void>
  stop?: () => void
  idle?: ReturnType<typeof setTimeout>
}

interface Sub {
  n: number
  kind: 'q' | 's'
  fn: Fn
  input: unknown
  tags: string[]
  buffer: number
  q: { raw: string; size: number }[]
  ac: AbortController
  request: Request
  options: ScopeOptions
}

interface Conn {
  k: string
  sink: Sink
  user?: string
  subs: Map<number, Sub>
  tags: Map<string, number>
  held: Set<Sub>
  pokes?: { t: Set<string>; c: string }
  bytes: number
  timers: ReturnType<typeof setTimeout>[]
}

export interface Hub {
  readonly bus: Bus
  readonly limits: Limits
  poke(tags: string[], origin?: string | null): Promise<void>
  cursor(): string | undefined
  /** Listening for pokes, or 250 ms: a page waits this long for a cursor, and goes without one. */
  ready(): Promise<unknown>
  cursorOf(seq: number): string
  channel(name: string): Channel
  replay(ch: Channel, after: string): Ev[] | undefined
  unlisten(ch: Channel, on: (ev: Ev | null) => void): void
  connect(request: Request, scope: Scope, body: Body, sink: Sink): Promise<Conn>
  change(c: Conn, request: Request, options: ScopeOptions, body: Body): Promise<void>
  drain(c: Conn): void
  close(c: Conn): void
  find(k: string): Conn | undefined
  connections(): Conn[]
  /** weft/test: a message straight to every reader of a stream. */
  push(id: string, msg: unknown): number
  /** Server-side counts for tests and `weft browser`. */
  stats(): { connections: number; subscriptions: number; channels: number }
  /** The live mode this server settled on: `.liveMode` on the client, and health routes. */
  live(): LiveState
  required: boolean
  /** Settled once the source has been probed. */
  probed: Promise<unknown>
  /** R015: required live queries, and no feed. Requests get this instead of stale data. */
  refused?: StartError
  shutdown(): Promise<void>
  /** The position a new listener resumes from. */
  position(): string
  /** Every poked tag, on this instance: socket.ts's `session:<user>` re-check. */
  watch(fn: (tags: string[]) => void): void
  /** Run at shutdown: socket.ts closes its sockets. */
  closing: Set<() => void>
  /** `room.publish` checks its messages (C002). */
  dev?: boolean
  /** The instance's name in a shared value's stamp. */
  epoch: string
  /** Seconds a connection may live (`RealtimeOptions.maxDuration`). */
  maxDuration?: number
  build?: string
}

const unref = <T,>(t: T) => ((t as any)?.unref?.(), t)

function createHub(options: HubOptions): Hub {
  const bus = options.bus ?? memoryBus()
  const limits = { ...LIMITS, ...options.limits }
  const epoch = crypto.randomUUID().slice(0, 8)
  const channels = new Map<string, Channel>()
  const conns = new Map<string, Conn>()
  const watchers = new Set<(tags: string[]) => void>()
  const closing = new Set<() => void>()
  let seq = 0
  const cursorOf = (n: number) => `${epoch}:${n}`
  const source = options.changes
  let live: LiveState = source ? { mode: 'off', via: 'none', why: 'not probed yet' } : { mode: 'app', via: 'mutations' }
  let refused: StartError | undefined
  let waking: Promise<unknown> | undefined, resting: ReturnType<typeof setTimeout> | undefined, beats: ReturnType<typeof setInterval> | undefined, beat = 0
  const report = (code: string, severity: string, message: string) => options.onDiagnostic?.({ code, severity, message })
  const status = (down: string | undefined) => {
    if (live.down === down) return
    live = { ...live, down }
    if (down) report('R016', 'warning', `live: ${down}`)
    for (const c of conns.values()) c.sink.write('L', JSON.stringify(wire()))
  }
  const wire = () => ({ m: live.mode, ...(live.down && { d: 1 }) })
  const feed: Feed | undefined = source && createFeed(source, {
    emit: p => pokes().got(JSON.stringify(p)),
    bump: tags => void (options.store ?? defaultStore).bump(tags),
    status,
  })
  const probed: Promise<unknown> = source && !process.env.WEFT_BUILD ? settle(source) : Promise.resolve()
  probed.catch(() => {})

  /** Probes rather than assumes (`what works here`), says what it found once, and refuses to serve what was required. */
  async function settle(source: Source) {
    const host = functionHost()
    const how: Probe = source.external
      ? { mode: 'feed', via: 'listener' }
      : host
        ? { mode: 'off', via: 'none', why: `${host} ends a process with its request, so nothing can hold a database connection`, fix: 'run `weft db listen` on an always-on host and set `listener: \'external\'`, or deploy to a server preset' }
        : await source.probe().catch(e => ({ mode: 'off' as const, via: 'none', why: e instanceof Error ? e.message : String(e), fix: 'check the database' }))
    live = { mode: source.external ? 'external' : how.mode, via: how.via, why: how.why, fix: how.fix }
    const line = `live: ${live.mode} (${live.via})${how.why ? `: ${how.why}` : ''}`
    if (how.mode === 'feed') console.info(`weft ${line}`)
    else {
      console.warn(`weft ${line}${how.fix ? `\n  fix: ${how.fix}` : ''}`)
      report('R016', 'warning', `${line}. \`.live()\` shows \`degraded\``)
    }
    if (how.mode === 'feed' || !options.required?.length) return how
    refused = new StartError('R015', `${options.required.map(n => `\`${n}\``).join(', ')} require${options.required.length > 1 ? '' : 's'} a live feed, and this server has ${how.mode === 'poll' ? 'only polling' : 'none'}${how.why ? `: ${how.why}` : ''}`, how.fix ?? 'see `weft doctor`', { status: 503 })
    console.error(`weft ${refused.message}`)
    if (!options.dev) process.exit(1)
    return how
  }

  /** The feed runs while someone can use it: a server with no clients holds no listener and runs no watcher. */
  function want() {
    clearTimeout(resting)
    resting = undefined
    if (!source) return
    if (source.external) {
      if (beats) return
      beat = Date.now()
      void pokes()
      beats = unref(setInterval(() => { if (Date.now() - beat > limits.window / 2) status('the external listener has gone quiet') }, limits.heartbeat / 2))
      return
    }
    return (waking ??= probed.then(how => feed!.start(how as Probe)).catch(e => status(e instanceof Error ? e.message : String(e))).finally(() => { waking = undefined }))
  }

  function rest() {
    if (!source || conns.size || resting || !feed?.running) return
    resting = unref(setTimeout(() => {
      resting = undefined
      if (!conns.size) void feed.stop()
    }, limits.window))
  }

  const trim = (ch: Channel) => {
    const old = Date.now() - limits.window
    let drop = 0
    while (drop < ch.ring.length && (ch.ring[drop].at < old || ch.ring.length - drop > limits.ring)) drop++
    if (!drop) return
    ch.floor = ch.ring[drop - 1].seq
    ch.ring.splice(0, drop)
  }

  function channel(name: string): Channel {
    let ch = channels.get(name)
    if (ch) {
      clearTimeout(ch.idle)
      ch.idle = undefined
      return ch
    }
    const made: Channel = { name, ring: [], floor: seq, listeners: new Set(), got: undefined as any, ready: undefined as any }
    channels.set(name, made)
    made.got = raw => {
      const ev = { seq: ++seq, at: Date.now(), raw }
      // Cursors and presence beats are only worth having now: in the ring they'd push out what a resume needs.
      if (!raw.startsWith(VOLATILE)) {
        made.ring.push(ev)
        trim(made)
      }
      for (const on of made.listeners) on(ev)
    }
    made.ready = bus.subscribe(name, made.got, () => {
      made.ring.length = 0
      made.floor = seq
      for (const on of made.listeners) on(null)
    }).then(stop => {
      made.stop = stop
      made.floor = seq
    }, e => {
      channels.delete(name) // the next use tries again; whoever awaits `ready` sees the failure
      throw e
    })
    made.ready.catch(() => {})
    return made
  }

  function unlisten(ch: Channel, on: (ev: Ev | null) => void) {
    ch.listeners.delete(on)
    if (ch.listeners.size || ch.idle) return
    ch.idle = unref(setTimeout(() => {
      ch.stop?.()
      channels.delete(ch.name)
    }, limits.window))
  }

  function replay(ch: Channel, after: string): Ev[] | undefined {
    const [e, n] = after.split(':')
    trim(ch)
    if (e !== epoch || !(+n >= ch.floor)) return
    return ch.ring.filter(ev => ev.seq > +n)
  }

  /** Listens from the first realtime use on, not from boot: `weft build` loads this with no bus to reach. */
  function pokes(): Channel {
    const had = channels.get('weft:poke')
    if (had) return had
    const ch = channel('weft:poke')
    ch.listeners.add(ev => {
      if (!ev) {
        for (const c of conns.values()) c.sink.write('R', JSON.stringify({ c: cursorOf(seq) }))
        return
      }
      const m = JSON.parse(ev.raw) as Poke & { o?: string; b?: 1 }
      if (m.b) { // an external listener's heartbeat
        beat = Date.now()
        return status(undefined)
      }
      for (const c of conns.values()) if (c.k !== m.o) poke(c, picked(c, m), ev.seq)
      for (const w of watchers) w(m.t)
    })
    return ch
  }

  /** What this connection subscribed to. `k`: a mutation's poke already reaches a subscription with one of these tags. */
  function picked(c: Conn, { t, p, k }: Poke) {
    if (!p && !k) return t.filter(x => c.tags.has(x))
    const out = new Set<string>()
    for (const s of c.subs.values()) {
      if (k && s.tags.some(x => k.includes(x))) continue
      for (const x of s.tags) if (t.includes(x) || p?.some(pre => x.startsWith(pre))) out.add(x)
    }
    return [...out]
  }

  function poke(c: Conn, tags: string[], at: number) {
    if (!tags.length) return
    if (!c.held.size && c.sink.backlog() < HIGH) return c.sink.write('p', JSON.stringify({ t: tags, c: cursorOf(at) }))
    const p = (c.pokes ??= { t: new Set(), c: '' })
    for (const t of tags) p.t.add(t)
    p.c = cursorOf(at)
  }

  /** Over `queue`: the client gets a bye, reconnects and resumes, rather than this process growing. */
  function hold(c: Conn, s: Sub, raw: string): boolean {
    const size = raw.length
    if (!s.buffer) {
      for (const x of s.q) c.bytes -= x.size
      s.q.length = 0
    } else if (s.q.length >= s.buffer) {
      for (const x of s.q) c.bytes -= x.size
      s.q.length = 0
      return false
    }
    s.q.push({ raw, size })
    c.bytes += size
    c.held.add(s)
    if (c.bytes > limits.queue) bye(c, 0)
    return true
  }

  /** Written to the client, or held. False: the buffer overflowed, so this stream resets. */
  function deliver(c: Conn, s: Sub, raw: string): boolean {
    if (!c.held.size && c.sink.backlog() < HIGH) return c.sink.write('m', raw), true
    return hold(c, s, raw)
  }

  function drain(c: Conn) {
    if (c.pokes && c.sink.backlog() < HIGH) {
      c.sink.write('p', JSON.stringify({ t: [...c.pokes.t], c: c.pokes.c }))
      c.pokes = undefined
    }
    for (const s of c.held) {
      while (s.q.length && c.sink.backlog() < HIGH) {
        const x = s.q.shift()!
        c.bytes -= x.size
        c.sink.write('m', x.raw)
      }
      if (s.q.length) return
      c.held.delete(s)
    }
  }

  function bye(c: Conn, retry: number) {
    c.sink.write('b', JSON.stringify({ retry }))
    close(c)
  }

  function close(c: Conn) {
    if (!conns.delete(c.k)) return
    for (const t of c.timers) clearTimeout(t)
    for (const s of c.subs.values()) s.ac.abort()
    c.subs.clear()
    c.sink.close()
    rest()
  }

  /** A subscription refused before it existed. */
  const refuse = (c: Conn, n: number, e: StartError) => c.sink.write('e', JSON.stringify([n, { code: e.code, message: e.message }]))

  function fail(c: Conn, s: Sub, e: unknown) {
    remove(c, s)
    if (e instanceof StartError) return c.sink.write('e', JSON.stringify([s.n, { code: e.code, message: e.message, ...(e.extra.issues ? { issues: e.extra.issues } : {}) }]))
    s.options.onDiagnostic?.({ code: 'E_RT', severity: 'error', message: `${s.fn.$id}: ${e instanceof Error ? e.stack ?? e.message : String(e)}` })
    c.sink.write('e', JSON.stringify([s.n, { message: s.options.dev && e instanceof Error ? e.message : 'Subscription failed.' }]))
  }

  function remove(c: Conn, s: Sub) {
    s.ac.abort()
    c.subs.delete(s.n)
    c.held.delete(s)
    for (const x of s.q) c.bytes -= x.size
    for (const t of s.tags) {
      const left = c.tags.get(t)! - 1
      left ? c.tags.set(t, left) : c.tags.delete(t)
    }
  }

  async function add(c: Conn, entry: SubEntry, request: Request, options: ScopeOptions) {
    const [n, kind, id, input, cursor, buffer] = entry
    const fn = fns.get(id)
    if (c.subs.size >= limits.subscriptions) return refuse(c, n, new StartError('R009', `this connection already has ${limits.subscriptions} subscriptions`, 'read fewer keys, or raise `limits.subscriptions`'))
    if (!fn || fn.kind !== (kind === 'q' ? 'query' : 'stream')) return refuse(c, n, new StartError('Q009', `no ${kind === 'q' ? 'query' : 'stream'} \`${id}\` (the page is older than the server): reload`))
    if (c.subs.has(n)) return
    const s: Sub = { n, kind, fn, input, tags: [], buffer: buffer ?? 0, q: [], ac: new AbortController(), request, options }
    c.subs.set(n, s) // before any await: a `d` that follows finds it
    try {
      const valid = await validate(fn, input)
      if (s.ac.signal.aborted) return
      if (kind === 's') return void stream(c, s, valid, cursor)
      guard(fn, fn.def.auth ? await createScope(request, options).ctx() : ({} as Context))
      if (s.ac.signal.aborted) return
      s.tags = await tagsOf(fn, valid, createScope(request, options))
      for (const t of s.tags) c.tags.set(t, (c.tags.get(t) ?? 0) + 1)
      if (options.dev) {
        liveQueries.set(fn.$id, s.tags)
        if (source) missedFeed(fn, s.tags, source.tables, options.onDiagnostic)
        if (!s.tags.length) options.onDiagnostic?.({ code: 'W053', severity: 'error', message: `\`${fn.$id}\` is read with \`.live()\` but declares no \`tags\`: no mutation can ever poke it. Add \`tags\` to the query` })
      }
      c.sink.write('a', JSON.stringify([n, s.tags]))
    } catch (e) {
      fail(c, s, e)
    }
  }

  /** One stream's `run`: resumed with its cursor, restarted without one on a reset. */
  async function stream(c: Conn, s: Sub, input: unknown, cursor?: string) {
    const { signal } = s.ac
    for (;;) {
      try {
        const scope = createScope(s.request, s.options)
        const frame = s.options.dev ? Object.create(scope, { touched: { value: { read: new Set(), write: new Set() } } }) : scope
        await enter(frame, async () => {
          const ctx = await scope.ctx()
          guard(s.fn, ctx)
          const replaced = s.options.handlers?.get(s.fn.$id) as any
          const out = replaced ? replaced(input, ctx, { signal, lastEventId: cursor }) : s.fn.def.run!({ input, ctx, signal, lastEventId: cursor })
          for await (const y of out as AsyncIterable<unknown>) {
            if (signal.aborted) return
            const [id, msg] = y instanceof Tracked ? [y.id, y.value] : [null, y]
            if (s.options.dev) await checked(s.fn, msg)
            const raw = JSON.stringify([s.n, id, msg])
            if (raw.length > limits.message) throw new StartError('R008', `\`${s.fn.$id}\` yielded ${raw.length} bytes; a message may be ${limits.message}`, 'send less, or an id the client fetches')
            if (id !== null) cursor = id
            if (!deliver(c, s, raw)) throw RESET
          }
        })
        if (signal.aborted) return
        remove(c, s)
        c.sink.write('f', JSON.stringify([s.n]))
        return
      } catch (e) {
        if (signal.aborted) return
        if (e !== RESET) return fail(c, s, e)
        cursor = undefined
        c.sink.write('r', JSON.stringify([s.n]))
      }
    }
  }

  async function change(c: Conn, request: Request, opts: ScopeOptions, body: Body) {
    for (const n of body.d ?? []) {
      const s = c.subs.get(n)
      if (s) remove(c, s)
    }
    await Promise.all((body.s ?? []).map(e => add(c, e, request, opts)))
  }

  function replayPokes(c: Conn, after: string) {
    const list = replay(pokes(), after)
    if (!list) return c.sink.write('R', JSON.stringify({ c: cursorOf(seq) }))
    for (const ev of list) {
      const m = JSON.parse(ev.raw) as Poke & { o?: string }
      if (m.o !== c.k) poke(c, picked(c, m), ev.seq)
    }
  }

  async function recheck(c: Conn) {
    const authed = [...c.subs.values()].filter(s => s.fn.def.auth)
    if (!authed.length) return
    const ctx = await createScope(authed[0].request, authed[0].options).ctx().catch(() => ({}) as Context)
    if (!conns.has(c.k)) return
    for (const s of authed) {
      try { guard(s.fn, ctx) } catch (e) { fail(c, s, e) }
    }
  }

  async function connect(request: Request, scope: Scope, body: Body, sink: Sink) {
    const opts = scope.options
    const ctx = await scope.ctx()
    const user = (ctx as { user?: { id?: string } }).user?.id
    if (user !== undefined && [...conns.values()].filter(c => c.user === user).length >= limits.connections) {
      throw new StartError('R009', `user \`${user}\` already has ${limits.connections} realtime connections`, 'close tabs, or raise `limits.connections`', { status: 429 })
    }
    const c: Conn = { k: crypto.randomUUID(), sink, user, subs: new Map(), tags: new Map(), held: new Set(), bytes: 0, timers: [] }
    conns.set(c.k, c)
    await pokes().ready.catch(e => {
      conns.delete(c.k)
      throw e
    })
    await want() // before `h`: a client that reads next must not miss a change
    sink.write('h', JSON.stringify({ k: c.k, e: epoch, b: options.build ?? '', c: cursorOf(seq), ...(source && { l: wire() }) }))
    await change(c, request, opts, body)
    if (body.c) replayPokes(c, body.c)
    let ticks = 0
    const every = Math.max(1, Math.round(limits.session / limits.heartbeat))
    c.timers.push(unref(setInterval(() => {
      sink.ping?.()
      if (++ticks % every === 0) void recheck(c)
    }, limits.heartbeat)))
    if (options.maxDuration) c.timers.push(unref(setTimeout(() => bye(c, 0), Math.max(1, options.maxDuration - 10) * 1000)))
    return c
  }

  return {
    bus, limits, cursorOf, channel, replay, unlisten, connect, change, drain, close, closing, epoch, dev: options.dev, maxDuration: options.maxDuration, build: options.build,
    position: () => cursorOf(seq),
    watch(fn) {
      watchers.add(fn)
      void pokes()
    },
    find: k => conns.get(k),
    connections: () => [...conns.values()],
    cursor: () => (pokes().stop ? cursorOf(seq) : undefined),
    ready: () => {
      const on = Promise.resolve(want()).then(rest)
      return Promise.race([Promise.all([pokes().ready.catch(() => {}), on]), new Promise(ok => unref(setTimeout(ok, 250)))])
    },
    async poke(tags, origin) {
      if (!tags.length) return
      // In this order: a client's refetch must start after what the barrier claims is covered.
      if (live.mode === 'feed' || live.mode === 'external') await feed?.settle(tags)
      await bus.publish('weft:poke', JSON.stringify({ t: tags, ...(origin && { o: origin }) }))
    },
    push(id, msg) {
      let hit = 0
      for (const c of conns.values()) {
        for (const s of c.subs.values()) {
          if (s.fn.$id !== id) continue
          hit++
          deliver(c, s, JSON.stringify([s.n, null, msg]))
        }
      }
      return hit
    },
    stats: () => ({ connections: conns.size, subscriptions: [...conns.values()].reduce((n, c) => n + c.subs.size, 0), channels: channels.size }),
    live: () => live,
    probed,
    required: !!options.required?.length,
    get refused() { return refused },
    async shutdown() {
      clearTimeout(resting)
      clearInterval(beats)
      await feed?.stop()
      for (const fn of closing) fn()
      for (const c of conns.values()) close(c)
      for (const ch of channels.values()) {
        clearTimeout(ch.idle)
        ch.stop?.()
      }
      channels.clear()
      await bus.close?.()
    },
  }
}

async function checked(fn: Fn, msg: unknown) {
  const r = await fn.def.message?.['~standard'].validate(msg)
  if (r?.issues) throw new StartError('C002', `\`${fn.$id}\` yielded a message its \`message\` schema rejects: ${r.issues.map(i => `${i.path?.map(p => (typeof p === 'object' ? p.key : p)).join('.') ?? ''}: ${i.message}`).join('; ')}`, 'fix `run`, or the schema', { status: 500 })
}

let current: Hub | undefined
/** The process's hub: the first caller makes the default one (memory bus). */
export const hub = (): Hub => (current ??= createHub({}))
/** Set by `createHandler`, from `src/realtime.server.ts`. */
export const configure = (options: HubOptions) => {
  void current?.shutdown() // a dev server's reload makes a new handler
  return (current = createHub(options))
}
/** This instance's connections, subscriptions and listened channels: for a health route. */
export const realtimeStats = () => hub().stats()
/**
 * For a health route: `ok` is false when required live queries have no working feed, now or at startup. A server that
 * started fine and lost its database mid-flight keeps running, and says so here: restarting it wouldn't bring the
 * database back, and it recovers by itself.
 */
export function liveHealth(): LiveState & { ok: boolean; required: boolean } {
  const h = hub(), s = h.live(), required = !!h.required
  return { ...s, required, ok: !required || ((s.mode === 'feed' || s.mode === 'external') && !s.down) }
}
/** weft/test, after each test. */
export const resetHub = () => {
  const old = current
  current = undefined
  return old?.shutdown()
}

// ---- topics ---------------------------------------------------------------------------------------------------------

export interface Topic<K, M> {
  /** Fan a message out to every subscriber, on every instance. */
  publish(key: K, message: M): Promise<void>
  /**
   * The messages of `keys`. Listens from this call, so a read that follows can't miss one (R006's gap): call it before
   * reading a backlog. With `after`, replays what the ring still has; outside the window the stream resets.
   */
  subscribe(keys: K | K[], options?: { signal?: AbortSignal; after?: string }): AsyncGenerator<Tracked<M>, void, void>
  readonly name: string
  readonly message?: StandardSchemaV1<any, M>
}

type Out<S> = S extends StandardSchemaV1<any, infer O> ? O : never

/** A typed server channel: mutations, jobs and webhooks publish, streams read. */
export function topic<K extends StandardSchemaV1<any, string | number>, M extends StandardSchemaV1>(name: string, def: { key?: K; message: M }): Topic<Out<K>, Out<M>> {
  const path = (key: unknown) => `weft:t:${name}:${key}`
  return {
    name,
    message: def.message as any,
    async publish(key, message) {
      const raw = JSON.stringify(message)
      const h = hub()
      if (raw.length > h.limits.message) throw new StartError('R008', `a \`${name}\` message is ${raw.length} bytes; a message may be ${h.limits.message}`, 'publish less, or an id subscribers fetch')
      await h.bus.publish(path(key), raw)
    },
    subscribe(keys, { signal, after } = {}) {
      const h = hub()
      if (currentScope()?.touched?.read.size) currentScope()!.options.onDiagnostic?.({ code: 'R006', severity: 'warning', message: `a stream read ${[...currentScope()!.touched!.read].join(', ')} before \`${name}.subscribe()\`: anything published in between is lost. Call \`subscribe\` first, or pass \`after\`` })
      const chans = (Array.isArray(keys) ? keys : [keys]).map(k => h.channel(path(k)))
      const q: Ev[] = []
      let wake: (() => void) | undefined
      let lost = false
      const on = (ev: Ev | null) => {
        if (ev) q.push(ev)
        else lost = true
        if (q.length > h.limits.ring) lost = true
        wake?.()
      }
      for (const ch of chans) ch.listeners.add(on) // before anything is read: that's the rule
      const stop = () => { for (const ch of chans) h.unlisten(ch, on) }
      const abort = () => wake?.()
      signal?.addEventListener('abort', abort)
      return (async function* () {
        try {
          await Promise.all(chans.map(c => c.ready))
          if (after) {
            const seen = new Set(q.map(e => e.seq))
            for (const ch of chans) {
              const back = h.replay(ch, after)
              if (!back) throw RESET
              for (const ev of back) if (!seen.has(ev.seq)) q.push(ev)
            }
            q.sort((a, b) => a.seq - b.seq)
          }
          for (;;) {
            if (signal?.aborted) return
            if (lost) throw RESET
            const ev = q.shift()
            if (ev) yield tracked(h.cursorOf(ev.seq), JSON.parse(ev.raw))
            else await new Promise<void>(ok => (wake = ok))
          }
        } finally {
          signal?.removeEventListener('abort', abort)
          stop()
        }
      })()
    },
  }
}

// ---- the HTTP route -------------------------------------------------------------------------------------------------

const enc = new TextEncoder()
const validBody = (b: any): b is Body =>
  !!b && typeof b === 'object' && !Array.isArray(b) &&
  (b.k === undefined || typeof b.k === 'string') && (b.c === undefined || typeof b.c === 'string') &&
  (b.d === undefined || (Array.isArray(b.d) && b.d.every((n: unknown) => typeof n === 'number'))) &&
  (b.s === undefined || (Array.isArray(b.s) && b.s.every((e: any) => Array.isArray(e) && typeof e[0] === 'number' && (e[1] === 'q' || e[1] === 's') && typeof e[2] === 'string')))

/** `/_weft/rt` (research 30 §4): opens a connection, or changes one. Same proof as a mutation, plus `origins`. */
export async function rtRoute(request: Request, scope: Scope, origins: string[] = []): Promise<Response> {
  const refuse = (code: string, message: string, status: number) => {
    scope.options.onDiagnostic?.({ code, severity: 'error', message })
    return Response.json({ e: { code, message } }, { status, headers: { 'cache-control': 'no-store' } })
  }
  if (request.method !== 'POST') return refuse('Q010', 'Q010: `/_weft/rt` needs POST', 405)
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  const allowed = origin && origins.includes(origin)
  if (!allowed && ((origin && origin !== url.origin) || (site && site !== 'same-origin' && site !== 'none'))) return refuse('R010', `R010: origin \`${origin ?? site}\` may not open a realtime connection: list it in \`realtime({ origins })\``, 403)
  if (request.headers.get('x-weft') !== '1' || !request.headers.get('content-type')?.startsWith('application/json')) return refuse('Q010', 'Q010: `/_weft/rt` without the CSRF proof (POST + JSON + `x-weft: 1`)', 403)
  const h = hub()
  const raw = await request.text()
  if (raw.length > h.limits.body) return refuse('R008', `R008: a realtime request of ${raw.length} bytes; the limit is ${h.limits.body}`, 413)
  let body: Body
  try {
    body = JSON.parse(raw)
  } catch {
    return refuse('Q002', 'Q002: `/_weft/rt` got a body that isn\'t JSON', 400)
  }
  if (!validBody(body)) return refuse('Q002', 'Q002: `/_weft/rt` got a body of the wrong shape', 400)
  if (body.k) {
    const c = h.find(body.k)
    const user = c && ((await scope.ctx()) as { user?: { id?: string } }).user?.id
    if (!c || c.user !== user) return refuse('Q009', 'Q009: no such realtime connection (reconnect with the whole set)', 404)
    await h.change(c, request, scope.options, body)
    return new Response(null, { status: 204 })
  }
  let conn: Conn | undefined
  let queued = 0
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const push = (text: string) => {
    const bytes = enc.encode(text)
    queued += bytes.length
    controller.enqueue(bytes)
  }
  const sink: Sink = {
    write: (event, data) => push(`event: ${event}\ndata: ${data}\n\n`),
    ping: () => push(': ping\n\n'),
    backlog: () => queued,
    close: () => { try { controller.close() } catch {} },
  }
  const out = new ReadableStream<Uint8Array>(
    {
      start: c => void (controller = c),
      // The reader took what was queued: the strategy's hwm of 0 means every pull is an empty queue.
      pull() {
        queued = 0
        if (conn) h.drain(conn)
      },
      cancel() {
        if (conn) h.close(conn)
        else closed = true
      },
    },
    { highWaterMark: 0 },
  )
  let closed = false
  try {
    conn = await h.connect(request, scope, body, sink)
  } catch (e) {
    if (e instanceof StartError) return refuse(e.code, e.message, (e.extra.status as number) ?? 500)
    throw e
  }
  if (closed) h.close(conn)
  return new Response(out, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no', connection: 'keep-alive' } })
}
