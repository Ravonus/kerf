import { rt, settle, computation, owner, add, NONE, mounts, schedule, within, clean } from './graph'
import type { Computation, Owner } from './types'

/** A child hole (@kerf/core/dom `insert`): `value` is tracked and unwrapped (functions called), `apply` places it. True: it read nothing, so it's done. */
export function hole<H>(
  value: () => unknown,
  apply: (value: unknown, was: unknown, h: H) => void,
  h?: H,
) {
  if (rt.server) return false
  return settle(computation(value, 2, apply as Computation['a'], h))
}

/** Runs `fn` when the current owner is disposed, or before it runs again. */
export function onCleanup(fn: () => void) {
  if (owner) owner.cleanups = add(owner.cleanups ?? NONE, fn)
}

/**
 * `fn` runs once the component's nodes are in place (refs assigned, the DOM inserted): after `render` returns its
 * first pass, or at the end of the `flush` that created the component. Skipped if the owner is disposed first.
 * Its owner is the component's, so `onCleanup` inside it works.
 */
export function onMount(fn: () => void) {
  if (rt.server) return
  const mine = owner
  let alive = true
  onCleanup(() => {
    alive = false
  })
  mounts.push(() => {
    if (alive) within(mine!, fn)
  })
  schedule()
}

/** Runs `fn`. Writes are always batched until the flush; this says so at the call. */
export function batch<T>(fn: () => T): T {
  return fn()
}

/** The owner of what's being created now, if any. */
export function getOwner() {
  return owner
}

/** Runs `fn` under a new owner that outlives its caller; `dispose` ends it and all it owns. */
export function createRoot<T>(fn: (dispose: () => void) => T, parent: Owner | null = owner): T {
  const root: Owner = { owned: null, tail: null, cleanups: null, owner: parent }
  return within(root, () => fn(() => clean(root)))
}
