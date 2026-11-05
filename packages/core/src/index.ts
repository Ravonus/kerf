// weft core: boxes, derivations, watchers and ownership (§3.1). Phase 1 spike.
// Push-pull graph: a write marks observers DIRTY/CHECK; effects flush in creation order.
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
export {
  DIRTY,
  DEV,
  devComponent,
  listener,
  setKeyed,
  rt,
  stats,
  NONE,
  read,
  reach,
  clean,
  flat,
  setFlat,
  flush,
  runMounts,
  untrack,
  within,
} from './index/graph'
export { hole, onCleanup, onMount, batch, getOwner, createRoot } from './index/lifecycle'
export {
  collecting,
  collect,
  plain,
  Box,
  state,
  Memo,
  named,
  name,
  derived,
  memo,
  watch,
  effect,
} from './index/state'
export { context, view, bind, omit, restOf } from './index/view'
export { localProps } from './linked'
export { Boundary, resource, type Resource, type ResourceOptions } from './async'
export { defineState, StateError, type ScopeHandle, type History, type HistoryEntry } from './scope'

/** A component's props, for the rare case inference doesn't cover: `Props<typeof Button>`. Types only. */
export type Props<C> = C extends (props: infer P, ...rest: never[]) => unknown ? P : never
