import type { ChangeReason } from '@weft/ui-core'
import { Box, state, untrack, type State } from 'weft'

/** 04 §1.1: a State to bind, or a plain value (controlled) or defaultValue; `onValueChange` hears every change. */
export interface Bindable<T> {
  value?: State<T> | T
  defaultValue?: T
  onValueChange?: (v: T, reason: ChangeReason) => void
}
export interface Openable {
  open?: State<boolean> | boolean
  defaultOpen?: boolean
  onOpenChange?: (o: boolean) => void
}

const isState = (v: any): v is State<any> => v instanceof Box

/** One read/write over the three ways a value can be held. */
export function bindable<T>(value: () => State<T> | T | undefined, initial: () => T | undefined, fallback: T, onChange?: () => ((v: T, r: ChangeReason) => void) | undefined) {
  const own = state<T>(untrack(() => { const v = value(); return (isState(v) ? undefined : (v as T | undefined)) ?? initial() ?? fallback }))
  return {
    get value(): T {
      const v = value()
      return isState(v) ? v.value : v !== undefined ? (v as T) : own.value
    },
    set(next: T, reason: ChangeReason = 'programmatic') {
      const v = untrack(value)
      if (isState(v)) v.value = next
      else own.value = next
      untrack(onChange ?? (() => undefined))?.(next, reason)
    },
  }
}
