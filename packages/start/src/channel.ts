// `channel` and `sharedState` (research 32): definitions on both sides, and the browser's half. One line per tab on the
// browser's one socket (link.ts), one join per id + params, shared by every reader and held by this module, so a remount within `keep`
// finds its messages. The socket server is socket.ts, and `room.in(params).publish` reaches it through
// `runtime.channels`, so nothing of the server ships here.

import { type Derived, type State } from '@kerf-js/core'
import {
  fns,
  runtime,
  StartError,
  track,
  type Context,
  type Fn,
  type Skip,
  type StandardSchemaV1,
} from './data'
import { connect, shared, connectBuiltIn } from './channel/connections'
import { keepOpen, wakeSocket, setFake, type Frame, type SocketLink } from './channel/socket'

export { connectBuiltIn, keepOpen, wakeSocket }
export type { Frame, SocketLink }

// ---- definitions ----------------------------------------------------------------------------------------------------

type In<S> = S extends StandardSchemaV1<infer I, unknown> ? I : void
type Out<S> = S extends StandardSchemaV1<unknown, infer O> ? O : undefined
type Schemas = Record<string, StandardSchemaV1>
type Inputs<T extends Schemas> = { [K in keyof T]: In<T[K]> }
type Outputs<T extends Schemas> = { [K in keyof T]: Out<T[K]> }

/**
 * Where a connection stands; `unauthorized` waits for `rejoin`. `unavailable`: this deploy can't hold a socket (a
 * function host, R024), so nothing connects and nothing is retried.
 */
export type ChannelStatus =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  | 'unauthorized'
  | 'unavailable'

/** `room.publish`: who a message goes to, and whether it can be replayed. */
export interface PublishOptions {
  /** Not back to the sender. */
  exceptSelf?: boolean
  /** Only to this connection, wherever it is: the `id` a handler was given. */
  to?: string
  /** Not kept for a resume: a cursor, a heartbeat, anything the next one replaces. */
  volatile?: boolean
}

/** A channel instance as a server handler has it. */
export interface Room<P, M> {
  params: P
  /** To everyone in the room, on every instance. */
  publish<K extends keyof M & string>(
    name: K,
    message: M[K],
    options?: PublishOptions,
  ): Promise<void>
}

/** `channel()`: the params, the messages each side may send, and who may join. */
export interface ChannelDef<
  P extends StandardSchemaV1 | undefined,
  C extends Schemas,
  S extends Schemas,
> {
  params?: P
  /** Required (R001). Runs on every join and at each session re-check. `() => true` must be written out. */
  authorize: (args: { ctx: Context; params: Out<P> }) => boolean | Promise<boolean>
  /** Client → server, always validated. */
  client?: C
  /** Server → client, validated in dev and tests. */
  server?: S
  /** `id` is the sender's connection, the same one `left` gets. */
  on?: {
    [K in keyof C]?: (args: {
      msg: Out<C[K]>
      id: string
      ctx: Context
      params: Out<P>
      room: Room<Out<P>, Inputs<S>>
    }) => unknown
  }
  /** A connection stopped being in the room: it left, closed, or lost `authorize`. Not called if its instance dies. */
  left?: (args: {
    id: string
    ctx: Context
    params: Out<P>
    room: Room<Out<P>, Inputs<S>>
  }) => unknown
  limits?: { perSecond?: number }
  $id?: string
}

/** A live join of a channel, from `.connect()`. */
export interface Connection<C, S> {
  readonly status: Derived<ChannelStatus>
  /** Which room this is. Changes when a function argument moves to another, even one already open. */
  readonly room: Derived<string | undefined>
  /** The last refusal or failure. */
  readonly error: unknown
  /** Ticks when the server couldn't resume: messages may be missing, so refetch what the room's history is. */
  readonly resets: Derived<number>
  /** Keep a room's messages of one name, in the cache: a remount within `keep` finds them. `key` drops a repeat. */
  collect<K extends keyof S & string>(
    name: K,
    options?: { max?: number; key?: (message: S[K]) => unknown },
  ): Derived<S[K][]>
  /** Each message of one name, until the owner is disposed. */
  on<K extends keyof S & string>(name: K, fn: (message: S[K]) => void): () => void
  onReset(fn: () => void): () => void
  /** Resolves on the server's ack, rejects with what it refused. Waits up to 10 s for the socket; never retries. */
  send<K extends keyof C & string>(name: K, message: C[K]): Promise<void>
  /** Join again after `unauthorized`. */
  retry(): void
}

type Arg<P> = P | (() => P | Skip)
/** How long a join outlives the last component using it. */
export interface ConnectOptions {
  keep?: string | number
}

/** What `channel()` returns: connect from a page, publish from the server. */
export interface Channel<P, C, S> {
  /** In a component or scope. A function argument re-joins when what it reads changes; `skip` leaves. */
  connect(
    ...args: [P] extends [void]
      ? [params?: undefined | (() => undefined | Skip), options?: ConnectOptions]
      : [params: Arg<P>, options?: ConnectOptions]
  ): Connection<C, S>
  /** On the server, from a mutation or a job. */
  in(...args: [P] extends [void] ? [] : [params: P]): {
    publish<K extends keyof S & string>(name: K, message: S[K]): Promise<void>
  }
  readonly kind: 'channel'
  readonly $id: string
}

const FN = Symbol.for('kerf.fn')
let auto = 0

/** A named room of schema-checked messages over the shared socket. */
export function channel<
  P extends StandardSchemaV1 | undefined = undefined,
  C extends Schemas = {},
  S extends Schemas = {},
>(def: ChannelDef<P, C, S>): Channel<In<P>, Inputs<C>, Outputs<S>> {
  const id = def.$id ?? `c${++auto}`
  if (!(def as { $stub?: boolean }).$stub && !def.authorize)
    throw new StartError(
      'R001',
      `\`${id}\` has no \`authorize\`: anyone could join it`,
      'add `authorize` (`() => true` must be written out)',
    )
  const fn: Fn = { kind: 'channel', $id: id, def: def as Fn['def'] }
  fns.set(id, fn)
  return {
    kind: 'channel',
    $id: id,
    [FN]: fn,
    connect: (params?: unknown, options?: ConnectOptions) => connect(fn, params, options),
    in: (params?: unknown) => ({
      publish: (name: string, message: unknown) =>
        runtime.channels!.publish(fn, params, name, message),
    }),
  } as never
}

/** `sharedState()`: the key and value schemas, the first value, and who reads and writes. */
export interface SharedDef<K extends StandardSchemaV1, V extends StandardSchemaV1> {
  key: K
  value: V
  /** What a reader has until the server says otherwise. Kept in the client bundle, so plain data. */
  initial: Out<V>
  /** Both required (R001). */
  authorize: {
    read: (args: { ctx: Context; key: Out<K> }) => boolean | Promise<boolean>
    write: (args: { ctx: Context; key: Out<K> }) => boolean | Promise<boolean>
  }
  $id?: string
}

/** A box in a scope: reads as a value, and a write is optimistic, sent, and last writer wins on the server. */
export type SharedBox<T> = State<T> & {
  readonly status: Derived<ChannelStatus>
  readonly error: unknown
}

/** What `sharedState()` returns: read a value on a page, set it from the server. */
export interface SharedState<K, V> {
  connect(key: K | (() => K | Skip), options?: ConnectOptions): SharedBox<V>
  /** On the server: write it from a mutation or a job. */
  in(key: K): { set(value: V): Promise<void> }
  readonly kind: 'shared'
  readonly $id: string
}

/** One value per key that every client holding that key sees change. */
export function sharedState<K extends StandardSchemaV1, V extends StandardSchemaV1>(
  name: string,
  def: SharedDef<K, V>,
): SharedState<In<K>, Out<V>> {
  const id = def.$id ?? `shared:${name}`
  if (!(def as { $stub?: boolean }).$stub && (!def.authorize?.read || !def.authorize?.write))
    throw new StartError(
      'R001',
      `\`${id}\` needs \`authorize: { read, write }\`: anyone could read or write it`,
      '`() => true` must be written out',
    )
  const fn: Fn = { kind: 'shared', $id: id, def }
  fns.set(id, fn)
  return {
    kind: 'shared',
    $id: id,
    [FN]: fn,
    connect: (key: unknown, options?: ConnectOptions) => shared(fn, key, options),
    in: (key: unknown) => ({ set: (value: unknown) => runtime.channels!.set(fn, key, value) }),
  } as never
}

/** @kerf-js/core/test only: an opaque specifier, so a bundler keeps neither the fake nor the socket server (research 30 §10). */
const FAKE = './channel-fake.ts' // with its extension: nothing resolves this one for a linked package
function fake(onFrame: (d: Frame) => void, closed: (code: number) => void): SocketLink {
  let link: SocketLink | undefined
  let up!: () => void
  void track(
    new Promise<void>((ok) => {
      up = ok
    }),
  )
  const loading = import(/* @vite-ignore */ FAKE)
    .then((m) => m.open(onFrame, closed, up))
    .then(
      (l) => (link = l),
      (e) => (up(), closed(1006), Promise.reject(e)),
    )
    .catch(() => {})
  return {
    send: (t) => void track(loading.then(() => link?.send(t))),
    close: () => {
      void loading.then(() => link?.close())
    },
  }
}

setFake(fake)
