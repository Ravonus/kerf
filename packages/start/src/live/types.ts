import type { Derived } from '@weft-js/core'
import type { Context, LiveOptions, LiveStatus, Skip, StandardSchemaV1 } from '../data'
import type { Tracked } from '../hub'

export type In<S> = S extends StandardSchemaV1<infer I, unknown> ? I : void
type Out<S> = S extends StandardSchemaV1<unknown, infer O> ? O : undefined

/** Where a stream stands; `done` is the end of a generator. */
export type StreamStatus = LiveStatus | 'done'

/** `stream()`: the input, the message schema and the generator. */
export interface StreamDef<S, M, A = undefined> {
  input?: S
  /** Checked in dev and tests (C002), and the contract's `message`. */
  message?: StandardSchemaV1<unknown, M>
  auth?: A
  /** `lastEventId`: the last `tracked` id the client saw, on a resume. Stop when `signal` aborts. */
  run: (args: {
    input: Out<S>
    ctx: Context
    signal: AbortSignal
    lastEventId?: string
  }) => AsyncIterable<M | Tracked<M>>
  $id?: string
}

/** `.live()` on a stream: what the value starts as, and how messages fold into it. */
export interface StreamOptions<M, T> extends LiveOptions {
  /** Keep every message: `fold(acc, message)`. Its state lives in the cache, so a remount finds it. */
  fold?: (acc: T, message: M) => T
  initial?: T
  /** Messages the server holds for a slow client. A fold defaults to 256; without one, the latest wins. */
  buffer?: number
}

/** A stream as a page reads it. */
export interface Stream<T> {
  /** The latest message, or the fold. */
  readonly value: T
  readonly status: Derived<StreamStatus>
  readonly error: unknown
}

/** What `stream()` returns. */
export interface StreamFn<I, M> {
  (input: Arg<I>): Stream<M | undefined>
  <T>(input: Arg<I>, options: StreamOptions<M, T> & { initial: T }): Stream<T>
  (input: Arg<I>, options: StreamOptions<M, M>): Stream<M | undefined>
  readonly kind: 'stream'
  readonly $id: string
}
type Arg<I> = I | (() => I | Skip)
