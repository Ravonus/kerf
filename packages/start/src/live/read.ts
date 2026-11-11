import {
  DEV,
  createRoot,
  derived,
  effect,
  getOwner,
  onCleanup,
  state,
  untrack,
} from '@kerf/core'
import type { Fn } from '../data'
import { currentScope, rt, skip, StartError } from './api'
import type { Sub, View } from './sub-types'
import type { Stream, StreamOptions } from './types'

export function read(
  fn: Fn,
  input: unknown,
  o: StreamOptions<never, unknown> = {},
  acquire: (fn: Fn, input: unknown) => Sub,
  held: (s: Sub, keep?: string | number) => () => void,
): Stream<unknown> {
  if (!getOwner())
    throw new StartError(
      'W051',
      DEV
        ? `\`${fn.$id}()\` (a stream) was called outside a component or scope: nothing would close it`
        : fn.$id,
      DEV
        ? 'call it in a component, a `defineState` setup or `createRoot(dispose => …)`'
        : undefined,
    )
  const scope = currentScope()
  if (scope) {
    scope.live = true // the server renders `initial`, and the client hydrates to the same
    return { value: o.initial, status: rt.status, error: undefined }
  }
  const view = state<{ s: Sub; v: View } | undefined>(undefined)
  const fold = o.fold ? String(o.fold) : ''
  effect(
    () => {
      const arg = typeof input === 'function' ? (input as () => unknown)() : input
      if (arg === skip) return undefined
      return untrack(() => {
        const s = acquire(fn, arg)
        if (o.fold) s.buffer ??= o.buffer ?? 256
        else if (o.buffer) s.buffer ??= o.buffer
        let v = s.views.get(fold)
        if (!v)
          s.views.set(
            fold,
            (v = createRoot(
              () => ({ fold: o.fold, initial: o.initial, box: state<unknown>(o.initial) }),
              null,
            )),
          )
        v.fold = o.fold
        onCleanup(held(s, o.keep))
        return { s, v }
      })
    },
    (now) => {
      view.value = now
    },
  )
  const status = derived(() => (view.value?.s.done.value ? 'done' : rt.status.value))
  return {
    get value() {
      const now = view.value
      return now ? now.v.box.value : o.initial
    },
    status,
    get error() {
      return view.value?.s.error.value
    },
  }
}
