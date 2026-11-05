import { Box } from '@weft-js/core/internal'
import {
  DEV,
  collect as boxes,
  derived,
  effect,
  getOwner,
  onCleanup,
  state,
  untrack,
  type Derived,
  type State,
} from '@weft-js/core'
import { currentScope, FnError, skip, StartError, track, type Fn } from '../data'
import type { ChannelStatus, ConnectOptions, Connection, SharedBox } from '../channel'
import {
  acquire,
  hold,
  listOf,
  post,
  rejoin,
  type Handle,
  type Join,
  type ListSpec,
} from './socket'

const NONE: never[] = []
type View = Join | undefined

/** The part `connect` and `shared` have in common: the current join, as the argument moves. */
function follow(
  fn: Fn,
  arg: unknown,
  options: ConnectOptions | undefined,
  handle: Handle,
  joined?: (j: Join) => void,
): State<View> {
  const view = state<View>(undefined)
  effect(
    () => {
      const params = typeof arg === 'function' ? (arg as () => unknown)() : arg
      if (params === skip) return undefined
      return untrack(() => {
        const j = acquire(fn, params)
        j.handles.add(handle)
        joined?.(j)
        const stop = hold(j, options?.keep)
        onCleanup(() => {
          j.handles.delete(handle)
          stop()
        })
        return j
      })
    },
    (now) => {
      view.value = now
    },
  )
  return view
}

function owned(fn: Fn) {
  if (!getOwner())
    throw new StartError(
      'W051',
      DEV
        ? `\`${fn.$id}.connect()\` was called outside a component or scope: nothing would close it`
        : fn.$id,
      DEV
        ? 'call it in a component, a `defineState` setup or `createRoot(dispose => …)`'
        : undefined,
    )
}

/** `@weft-js/start/share`'s way in: a join that nothing on the page declared, so a tab shares this socket and its lifecycle. */
export const connectBuiltIn = ($id: string) =>
  connect({ kind: 'channel', $id, def: {} }, undefined, { keep: 0 })

export function connect(
  fn: Fn,
  arg: unknown,
  options?: ConnectOptions,
): Connection<Record<string, never>, Record<string, never>> {
  owned(fn)
  if (currentScope()) {
    const closed = { value: 'connecting' as ChannelStatus }
    return {
      status: closed,
      room: { value: undefined },
      error: undefined,
      resets: { value: 0 },
      collect: () => ({ value: NONE }),
      on: () => () => {},
      onReset: () => () => {},
      send: () =>
        Promise.reject(new FnError({ message: 'a channel has no socket on the server' }, 500)),
      retry() {},
    }
  }
  const handle: Handle = { on: new Map(), resets: new Set() }
  const wanted: ListSpec[] = []
  const view = follow(fn, arg, options, handle, (j) => {
    for (const w of wanted) listOf(j, w)
  })
  return {
    status: derived(() => view.value?.status.value ?? 'closed'),
    room: derived(() => view.value?.key),
    get error() {
      return view.value?.error.value
    },
    resets: derived(() => view.value?.resets.value ?? 0),
    collect(name, { max = 200, key } = {}) {
      const spec: ListSpec = { name, max, key }
      wanted.push(spec)
      const had = untrack(() => view.value)
      if (had) listOf(had, spec)
      return derived(() => {
        const j = view.value
        return (j ? listOf(j, spec).box.value : NONE) as never[]
      })
    },
    on(name, listener) {
      const set = handle.on.get(name) ?? new Set()
      handle.on.set(name, set)
      set.add(listener)
      const stop = () => void set.delete(listener)
      onCleanup(stop)
      return stop
    },
    onReset(listener) {
      handle.resets.add(listener)
      const stop = () => void handle.resets.delete(listener)
      onCleanup(stop)
      return stop
    },
    send(name, message) {
      const j = untrack(() => view.value)
      return j
        ? post(j, name, message)
        : Promise.reject(new FnError({ message: 'this channel is closed' }, 400))
    },
    retry() {
      const j = untrack(() => view.value)
      if (j?.refused) rejoin(j)
    },
  }
}

/** `Box.w` is the one way a write gets in, so a subclass sees every write, and `Instance` never touches it. */
class Shared<T> extends Box<T> {
  declare remote?: boolean
  declare pending: number
  declare base: { v: T; at: number }
  declare view: State<View>
  declare statusOf: Derived<ChannelStatus>
  declare problem: State<unknown>
  get status() {
    return this.statusOf
  }
  get error() {
    return this.problem.value
  }
  /** A server value: applied unless a local write is still on its way. */
  apply(v: { v: T; at: number }) {
    if (v.at >= this.base.at) this.base = v
    if (!this.pending) this.quiet(this.base.v)
  }
  quiet(v: T) {
    this.remote = true
    this.w(v)
    this.remote = false
  }
  override w(v: T) {
    if (this.remote) return super.w(v)
    const j = untrack(() => this.view.value)
    if (!j) return super.w(v)
    super.w(v)
    this.pending++
    this.problem.value = undefined
    void track(
      post(j, '$set', v)
        .then(
          () => {
            this.pending--
          },
          (e) => {
            this.pending--
            this.problem.value = e
          },
        )
        .finally(() => {
          if (!this.pending) this.quiet(this.base.v)
        }),
    )
  }
}

export function shared(fn: Fn, arg: unknown, options?: ConnectOptions): SharedBox<unknown> {
  owned(fn)
  const initial = fn.def.initial
  const [b] = boxes(() => new Shared<unknown>(initial))
  b.pending = 0
  b.base = { v: initial, at: 0 }
  b.problem = state<unknown>(undefined)
  if (currentScope()) {
    b.statusOf = { value: 'connecting' }
    b.view = state<View>(undefined)
    return b
  }
  const handle: Handle = { on: new Map(), resets: new Set(), value: (v) => b.apply(v) }
  b.view = follow(fn, arg, options, handle, () => {
    b.base = { v: initial, at: 0 }
  })
  b.statusOf = derived(() => b.view.value?.status.value ?? 'closed')
  return b
}
