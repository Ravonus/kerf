import type { State } from '@kerf-js/core'
import type { Fn } from '../data'

export interface View {
  fold?: ((acc: never, m: never) => unknown) | undefined
  initial: unknown
  box: State<unknown>
}
export interface Sub {
  n: number
  key: string
  fn: Fn
  input: unknown
  refs: number
  timer?: ReturnType<typeof setTimeout> | undefined
  /** Stream: the last id, sent back on a resume. Query: its tags, from the ack. */
  cursor?: string | undefined
  tags: string[]
  buffer?: number
  acked: boolean
  views: Map<string, View>
  error: State<unknown>
  done: State<boolean>
}
