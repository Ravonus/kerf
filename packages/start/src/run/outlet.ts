import { onCleanup, state, untrack } from '@kerf-js/core'
import { onRenderError } from '@kerf-js/core/internal'
import type { RouteState } from '../router'

// Keep recovery attached to the live owner, including when a shared layout survives navigation.

export function recover(route: RouteState) {
  const pending = state(false)
  const recovery: { retry?: () => Promise<void>; fail?: (depth: number, error: unknown) => void } =
    {}
  route.recovery = {
    retry: () => recovery.retry?.() ?? Promise.resolve(),
    get pending() {
      return pending.value
    },
  }
  route.guard = (depth, id, body) => {
    const lv = route.levels[depth]!
    let alive = true
    onCleanup(() => {
      alive = false
    })
    onRenderError((error) => {
      queueMicrotask(() => {
        if (alive && untrack(() => lv.id.value) === id) recovery.fail?.(depth, error)
      })
    })
    return body()
  }
  return { pending, recovery }
}
