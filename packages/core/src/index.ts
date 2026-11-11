// Public boxes, derivations, watchers and ownership (§3.1).
// Compiler and runtime helpers live at @kerf/core/internal.
export type {
  Owner,
  Computation,
  EffectOptions,
  SsrData,
  State,
  StateOptions,
  StandardSchema,
  Derived,
  Linked,
} from './index/types'
export { DEV, flush, untrack, within } from './index/graph'
export { onCleanup, onMount, batch, getOwner, createRoot } from './index/lifecycle'
export {
  collect,
  plain,
  state,
  Memo,
  named,
  name,
  derived,
  memo,
  watch,
  effect,
} from './index/state'
export { context, view, bind, omit } from './index/view'
export { Boundary, resource, type Resource, type ResourceOptions } from './async'
export { defineState, StateError, type ScopeHandle, type History, type HistoryEntry } from './scope'

/** A component's props, for the rare case inference doesn't cover: `Props<typeof Button>`. Types only. */
export type Props<C> = C extends (props: infer P, ...rest: never[]) => unknown ? P : never
