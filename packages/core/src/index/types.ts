import type { Box } from './state'

export type Source = {
  v: unknown
  /** first reader, then the rest */ f: Computation | undefined
  o: Computation[]
  /** a `get(key)` source: its box and key */ b?: Box<unknown>
  key?: PropertyKey
}

/** What holds computations and cleanups: a root, or a computation over what it makes. Disposing it disposes them. */
export interface Owner {
  /** First owned; `CHAIN` follows `sib`, or a list. */
  owned: Computation | Computation[] | null
  /** Last owned. */
  tail?: Computation | null | undefined
  cleanups: (() => void)[] | null
  owner: Owner | null
  /** Set by `provide` on its root; everything below finds it through `owner`. */
  context?: Record<symbol, unknown>
}

/** A node of the graph: a derived value or an effect, with what it reads and what reads it. */
export interface Computation extends Source, Owner {
  /** The next computation its owner owns. */
  sib: Computation | null
  fn: (prev: unknown) => unknown
  /** First source, then the rest. */
  p: Source | undefined
  s: Source[]
  state: number
  /** 0: derived (lazy), 1: effect (queued), 2: effect whose value is unwrapped (a child hole: functions are called), 3: disposed */
  effect: 0 | 1 | 2 | 3
  /** Effects: writes the computed value, untracked (`apply(value, prev)`). */
  a: ((value: unknown, prev: unknown, h: unknown) => void) | undefined
  /** What a shared `a` works on. */
  h: unknown
  id: number
  /** Dev name: the binding (`li.children`), its source location and the component it was created in. */
  n?: string
}

/** Dev names compiled bindings pass (`name`/`loc`). */
export interface EffectOptions {
  name?: string | undefined
  loc?: string | undefined
}

/** What the server hands the client: resolved resources, boundary states and changed state boxes. */
export type SsrData = {
  r: Record<string, { v?: unknown; e?: string }>
  b: Record<string, 'c' | 'p' | 'e'>
  /** The page is still streaming: the client may start before its Boundaries land. */ w?: 1
  /** `defineState` boxes that differ from `init`, by scope */ s?: Record<
    string,
    Record<string, unknown>
  >
}

/** A box: a value that readers re-run on. */
export interface State<T> {
  value: T
  /** Deep update: mutate a copy (arrays/objects are shallow-copied first). */
  set(update: (draft: T) => void): void
  /**
   * Read one entry of an object box. The reader re-runs only when that entry changes (`Object.is`), not on every
   * write to the box: `cart.get(p.id)?.qty` in 150 rows re-runs 1 row on add-one, `cart.value[p.id]` re-runs 150.
   */
  get<K extends keyof T>(key: K): T[K]
}

/** How a box is kept: where it persists, whether tabs share it, and whether undo sees it. */
export interface StateOptions<T> {
  /** Persist through reloads (§4.5). Only inside `defineState`. The short form takes primitive `init` only. */
  persist?:
    | 'local'
    | 'session'
    | 'cookie'
    | 'memory'
    | {
        in: 'local' | 'session' | 'cookie' | 'memory'
        /** Required for object and array values: a Standard Schema (Zod, Valibot, ArkType). */
        schema?: StandardSchema<T>
        version?: number
        migrate?: Record<number, (old: never) => unknown>
        /** `cookie` only: seconds it lives. Default one year. */
        maxAge?: number
      }
  /** Keep this box the same in every tab (research 32 §1). Needs `persist`, not in `'session'`: new tabs read it there. */
  sync?: 'tabs'
  /** Leave this box out of its scope's undo history. */
  history?: false
  /** Name inside its scope (`cart.<name>`). Returned boxes are named by their key; a private persisted box needs one. */
  name?: string
}

/** The validation half of the Standard Schema spec (standardschema.dev). */
export interface StandardSchema<T = unknown> {
  readonly '~standard': {
    validate(
      value: unknown,
    ):
      | { value: T; issues?: undefined }
      | { issues: readonly { message: string }[] }
      | Promise<unknown>
  }
}

/** A value computed from boxes: lazy, cached, and read-only. */
export interface Derived<T> {
  readonly value: T
}

/** A box that follows `source` until written, and says when the source moved under a local edit. */
export interface Linked<T> extends State<T> {
  /** With `key`: the source moved under a local edit. `theirs` is its value now, `base` the one the edit started from. */
  readonly conflict: Derived<{ theirs: T; base: T } | undefined>
}
