import { owner } from './graph'
import type { Owner } from './types'

const errorHandlers = new WeakMap<Owner, (error: unknown) => void>()

/** Give a render owner responsibility for errors in its subtree. */
export function onRenderError(handler: (error: unknown) => void) {
  if (owner) errorHandlers.set(owner, handler)
}

/** Report a fault to the nearest render owner that can handle it. */
export function reportRenderError(error: unknown, from = owner): boolean {
  for (let scope = from; scope; scope = scope.owner) {
    const handle = errorHandlers.get(scope)
    if (!handle) continue
    handle(error)
    return true
  }
  return false
}
