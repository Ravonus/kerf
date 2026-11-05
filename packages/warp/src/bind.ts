import type { ChangeReason } from '@weft-js/warp-core'
import { Box } from '@weft-js/core/internal'
import { state, untrack, type State } from '@weft-js/core'

/** 04 §1.1: a State to bind, or a plain value (controlled) or defaultValue; `onValueChange` hears every change. */
export interface Bindable<T> {
  value?: State<T> | T
  defaultValue?: T
  /** Called with each new value, and whether a pointer, a key or code made the change. */
  onValueChange?: (v: T, reason: ChangeReason) => void
}
/** An overlay's open state, held by the caller or by the component. */
export interface Openable {
  open?: State<boolean> | boolean
  /** Starts open, when the component keeps its own open state. */
  defaultOpen?: boolean
  /** Called with `true` when it opens and `false` when it closes. */
  onOpenChange?: (o: boolean) => void
}

const isState = (v: unknown): v is State<unknown> => v instanceof Box

/** One read/write over the three ways a value can be held. */
export function bindable<T>(
  value: () => State<T> | T | undefined,
  initial: () => T | undefined,
  fallback: T,
  onChange?: () => ((v: T, r: ChangeReason) => void) | undefined,
) {
  const own = state<T>(
    untrack(() => {
      const v = value()
      return (isState(v) ? undefined : v) ?? initial() ?? fallback
    }),
  )
  const read = (): T => {
    const v = value()
    return isState(v) ? v.value : v !== undefined ? v : own.value
  }
  const first = untrack(read)
  const set = (next: T, reason: ChangeReason = 'programmatic') => {
    const v = untrack(value)
    if (isState(v)) v.value = next
    else own.value = next
    untrack(onChange ?? (() => undefined))?.(next, reason)
  }
  return {
    get value(): T {
      return read()
    },
    set,
    /** Back to the value it started with: a form's reset. */
    reset: () => {
      set(first)
    },
  }
}
