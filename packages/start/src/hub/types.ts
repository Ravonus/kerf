import type { Bus } from '../bus'
import type { Source } from '../changes'
import type { Fn, LiveMode, StartError } from '../data'
import type { Scope, ScopeOptions, Store } from '../exec'
import type { ShareRule } from '../share-server'

/** What one connection may cost; every number has a default in `LIMITS`. */
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
  /** Keys one socket may `share`. They cost no joins: a 200-row list is one. */
  shareKeys: number
}

/** `realtime()`: the options of an app's `src/realtime.server.ts`. */
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
  /**
   * Who may share or see a key of `interaction({ share })` with other clients. Left out, nobody: tabs still work. One
   * key at a time, `({ ctx, key }) => boolean`, or `{ keys: ({ ctx, keys }) => allowed }` to answer a whole join at once.
   */
  share?: ShareRule | undefined
}

/** What the app gets from `configure`, beside `src/realtime.server.ts`. */
export interface HubOptions extends RealtimeOptions {
  build?: string | undefined
  dev?: boolean | undefined
  /** Queries marked `live: { required: true }`: without a real feed the server refuses to run (R015). */
  required?: string[] | undefined
  store?: Store | undefined
  onDiagnostic?: ScopeOptions['onDiagnostic'] | undefined
}

/** What `.live` reports, and a health route reads. */
export interface LiveState {
  mode: LiveMode
  via: string
  why?: string | undefined
  fix?: string | undefined
  /** The feed works in general and is out right now. */
  down?: string | undefined
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
export type SubEntry = [
  n: number,
  kind: 'q' | 's',
  id: string,
  input?: unknown,
  cursor?: string,
  buffer?: number,
]
/** The body of `/_weft/rt`: the cursor, subscriptions to add, and subscriptions to drop. */
export interface Body {
  k?: string
  c?: string | undefined
  s?: SubEntry[]
  d?: number[]
}

/** One message in a channel's ring. */
export interface Ev {
  seq: number
  at: number
  raw: string
  /** Parsed once, for every socket of a room. */ p?: unknown
}
/** One hub channel: its replay ring and who's listening on this instance. */
export interface Channel {
  name: string
  ring: Ev[]
  floor: number
  listeners: Set<(ev: Ev | null) => void>
  /** Take a message as if the bus had brought it: a change feed reaches this instance's connections only. */
  got: (raw: string) => void
  ready: Promise<void>
  stop?: () => void
  idle?: ReturnType<typeof setTimeout> | undefined
}

export interface Sub {
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

/** One client's realtime connection. */
export interface Conn {
  k: string
  sink: Sink
  user?: string | undefined
  subs: Map<number, Sub>
  tags: Map<string, number>
  held: Set<Sub>
  pokes?: { t: Set<string>; c: string } | undefined
  bytes: number
  timers: ReturnType<typeof setTimeout>[]
}

/** The realtime server of this process: channels, connections and the change feed. */
export interface Hub {
  readonly bus: Bus
  readonly limits: Limits
  /** `realtime({ share })`. */
  readonly share?: ShareRule | undefined
  poke(tags: string[], origin?: string | null): Promise<void>
  cursor(): string | undefined
  /** Listening for pokes, or 250 ms: a page waits this long for a cursor, and goes without one. */
  ready(): Promise<unknown>
  cursorOf(seq: number): string
  channel(name: string): Channel
  replay(ch: Channel, after: string): Ev[] | undefined
  unlisten(ch: Channel, on: (ev: Ev | null) => void): void
  /** `line`: one tab on a shared socket (mux.ts), which `limits.connections` counted already. */
  connect(request: Request, scope: Scope, body: Body, sink: Sink, line?: boolean): Promise<Conn>
  change(c: Conn, request: Request, options: ScopeOptions, body: Body): Promise<void>
  drain(c: Conn): void
  close(c: Conn): void
  find(k: string): Conn | undefined
  connections(): Conn[]
  /** @weft-js/core/test: a message straight to every reader of a stream. */
  push(id: string, msg: unknown): number
  /** Server-side counts for tests and `weft browser`. */
  stats(): { connections: number; subscriptions: number; channels: number }
  /** The live mode this server settled on: `.liveMode` on the client, and health routes. */
  live(): LiveState
  required: boolean
  /** Settled once the source has been probed. */
  probed: Promise<unknown>
  /** R015: required live queries, and no feed. Requests get this instead of stale data. */
  refused?: StartError | undefined
  shutdown(): Promise<void>
  /** The position a new listener resumes from. */
  position(): string
  /** Every poked tag, on this instance: socket.ts's `session:<user>` re-check. */
  watch(fn: (tags: string[]) => void): void
  /** Run at shutdown: socket.ts closes its sockets. */
  closing: Set<() => void>
  /** `room.publish` checks its messages (C002). */
  dev?: boolean | undefined
  /** The instance's name in a shared value's stamp. */
  epoch: string
  /** Seconds a connection may live (`RealtimeOptions.maxDuration`). */
  maxDuration?: number | undefined
  build?: string | undefined
}
