import { DEV, effect, getOwner, onCleanup, resource, untrack, type Resource } from '@weft-js/core'
import { fill, mask } from '@weft-js/core/shape'
import { entries, entry, fresh, lastSeen, load, predicted } from './cache'
import { rt, runtime, server, skip, net } from './foundation'
import { liveApi } from './live-api'
import { keyOf, StartError } from './primitives'
import { track } from './transport'
import type { Fn, LiveOptions, LiveQuery } from './types'

export function fetchQuery(fn: Fn, input: unknown): Promise<unknown> {
  const scope = server()
  if (scope) return runtime.exec!.fetchQuery(scope, fn, input).then((e) => e.v)
  if (runtime.exec && !net())
    return runtime.exec
      .fetchQuery(runtime.exec.createScope(new Request('http://localhost/')), fn, input)
      .then((e) => e.v)
  const e = entry(fn, input)
  return untrack(() => fresh(e)) ? Promise.resolve(untrack(() => e.value.value)) : load(e)
}

export function use(fn: Fn, input: unknown): Resource<unknown> {
  if (!getOwner())
    throw DEV
      ? new StartError(
          'Q001',
          `\`${fn.$id}()\` (a live query) was called outside a component or scope`,
          `\`await ${name(fn)}.fetch(input)\` in \`load\`, handlers and server code`,
        )
      : new StartError('Q001', fn.$id)
  const read = () => (typeof input === 'function' ? (input as () => unknown)() : input)
  return resource(
    () => {
      const arg = read()
      if (arg === skip) return undefined
      const scope = server()
      if (scope) return runtime.exec!.readQuery(scope, fn, arg)
      const e = entry(fn, arg)
      e.readers++
      onCleanup(() => void e.readers--)
      const v = e.value.value // tracked: a new base or layer re-runs this, and the resource settles to it in place
      if (fresh(e)) return v
      if (e.has.value && predicted(e)) {
        e.held = true // the prediction shows now, and a read waits for the calls behind it
        return v
      }
      return e.has.value ? load(e).catch(() => untrack(() => e.value.value)) : load(e) // a failed refetch leaves what's on screen
    },
    {
      data: false,
      shape: {
        of: fn,
        read() {
          const arg = read()
          return arg === skip ? undefined : shapeOf(fn, arg)
        },
      },
    },
  )
}

/** Research 31 §2: this entry's value or the query's last seen, masked; else the declared shape. */
export function shapeOf(fn: Fn, input: unknown): unknown {
  const limit: number | undefined = (input as { limit?: number } | undefined)?.limit
  const here = entries.get(keyOf(fn.$id, input))
  const e = server()
    ? undefined
    : here && untrack(() => here.has.value)
      ? here
      : lastSeen.get(fn.$id)
  if (e)
    return mask(
      untrack(() => e.value.value),
      limit,
    )
  const tree = runtime.exec ? runtime.exec.shapeOf(fn) : fn.def.shape
  return tree === undefined ? undefined : fill(tree, limit)
}

/** `q()` plus a subscription: its tags come from the server, and a poke is a local `cache.invalidate`. */
export function liveQuery(fn: Fn, input: unknown, options?: LiveOptions): LiveQuery<unknown> {
  const r = use(fn, input)
  const scope = server()
  if (scope) scope.live = true
  else
    effect(
      () => {
        const arg = typeof input === 'function' ? (input as () => unknown)() : input
        if (arg === skip) return
        let gone = false,
          stop: (() => void) | undefined
        const held = import('../live').then((m) => {
          m.use(liveApi)
          if (!gone) stop = m.hold(fn, arg, options)
        })
        void track(held)
        onCleanup(() => {
          gone = true
          stop?.()
        })
      },
      () => {},
    )
  return Object.assign(r, { live: rt.status, liveMode: rt.mode })
}

const name = (fn: Fn) => fn.$id.replace(/\..*$/, '')
