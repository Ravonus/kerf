import type { State } from '@kerf-js/core'
import type { PublicFailure } from '@kerf-js/core/errors'
import type { ChannelStatus } from '../channel'
import type { Fn } from '../data'

export interface ListSpec {
  name: string
  max: number
  key?: ((m: never) => unknown) | undefined
}
export interface List extends ListSpec {
  box: State<unknown[]>
}
export interface Handle {
  on: Map<string, Set<(m: never) => void>>
  resets: Set<() => void>
  value?(v: { v: unknown; at: number }): void
}
export interface Join {
  n: number
  key: string
  fn: Fn
  params: unknown
  refs: number
  timer?: ReturnType<typeof setTimeout> | undefined
  cursor?: string | undefined
  joined: boolean
  refused: boolean
  status: State<ChannelStatus>
  error: State<unknown>
  resets: State<number>
  lists: Map<string, List>
  handles: Set<Handle>
  /** `send`s waiting for the join. */
  waiting: Set<() => void>
}

/** What the server sends a channel's client: the first element says which. */
type FrameFailure = Partial<
  Pick<PublicFailure, 'code' | 'message' | 'status' | 'ref'> & { reference: string }
>

export type Frame =
  | ['h', { b?: string }]
  | ['j', number, string | undefined]
  | ['m', number, string | undefined, string, never]
  | ['r', number, string | undefined]
  | ['e', number, FrameFailure]
  | ['a', number, number, FrameFailure | undefined]

export interface SocketLink {
  send(text: string): void
  close(): void
}
