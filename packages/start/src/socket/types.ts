import type { Context, Fn } from '../data'
import type { ScopeOptions } from '../exec'
import type { Channel, Ev } from '../hub'
import type { Peer } from '../socket'

export interface Join {
  n: number
  fn: Fn
  params: unknown
  room?: Room
  on?: (ev: Ev | null) => void
  bucket: Bucket
  gone?: boolean
  chain: Promise<unknown>
}
export interface Bucket {
  tokens: number
  at: number
}
export interface Sock {
  k: string
  peer: Peer
  request: Request
  options: ScopeOptions
  ctx: Context
  user?: string | undefined
  joins: Map<number, Join>
  bucket: Bucket
  last: number
  timers: ReturnType<typeof setTimeout>[]
}
export interface Room {
  name: string
  ch: Channel
  refs: number
  shared: boolean
  on: (ev: Ev | null) => void
}
export interface Value {
  v: unknown
  at: number
  o: string
}
export interface Hubbed {
  socks: Set<Sock>
  rooms: Map<string, Room>
  values: Map<string, Value>
}
