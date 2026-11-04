import { createRoot, derived, state } from '@weft-js/core'
import { FN, SUBMIT, fns, nextAuto } from './foundation'
import { mutate } from './mutation'
import { StartError } from './primitives'
import { fetchQuery, liveQuery, shapeOf, use } from './query'
import type {
  AuthScope,
  Fn,
  ImplMutationDef,
  ImplQueryDef,
  In,
  Mutation,
  MutationDef,
  Out,
  Query,
  QueryDef,
  StandardSchemaV1,
  LiveOptions,
} from './types'

const oneBody = (def: { run?: unknown; impl?: unknown; $id?: string }) => {
  if (def.run && def.impl)
    throw new StartError(
      'R103',
      `\`${def.$id ?? 'a function'}\` has both \`run\` and \`impl\``,
      'keep one: `impl` replaces the body',
    )
}

/** A server function that reads, with its output typed by a schema. */
export function query<
  OS extends StandardSchemaV1,
  S extends StandardSchemaV1 | undefined = undefined,
  const A extends AuthScope | undefined = undefined,
>(def: ImplQueryDef<S, OS, A>): Query<In<S>, Out<OS>>
/** A server function that reads, with its output typed by `run`. */
export function query<
  O,
  S extends StandardSchemaV1 | undefined = undefined,
  const A extends AuthScope | undefined = undefined,
>(def: QueryDef<S, O, A>): Query<In<S>, Awaited<O>>
/** A server function that reads: cached by input on the client, and tagged for what invalidates it. */
export function query(def: unknown): unknown {
  const d = def as Fn['def'] & { $id?: string }
  oneBody(d)
  const id = d.$id ?? `q${nextAuto()}`
  const fn: Fn = { kind: 'query', $id: id, def: d }
  fns.set(id, fn)
  const q = (input?: unknown) => use(fn, input)
  q.fetch = (input?: unknown) => fetchQuery(fn, input)
  q.shape = (input?: unknown) => shapeOf(fn, input)
  q.live = (input?: unknown, options?: LiveOptions) => liveQuery(fn, input, options)
  return Object.assign(q, { kind: 'query', $id: id, [FN]: fn })
}

/** A server function that writes, with its output typed by a schema. */
export function mutation<
  OS extends StandardSchemaV1,
  S extends StandardSchemaV1 | undefined = undefined,
  const A extends AuthScope | undefined = undefined,
>(def: ImplMutationDef<S, OS, A>): Mutation<In<S>, Out<OS>>
/** A server function that writes, with its output typed by `run`. */
export function mutation<
  O,
  S extends StandardSchemaV1 | undefined = undefined,
  const A extends AuthScope | undefined = undefined,
>(def: MutationDef<S, O, A>): Mutation<In<S>, Awaited<O>>
/** A server function that writes, and invalidates the queries that read what it changed. */
export function mutation(def: unknown): unknown {
  const d = def as Fn['def'] & { $id?: string }
  oneBody(d)
  const id = d.$id ?? `m${nextAuto()}`
  const fn: Fn = { kind: 'mutation', $id: id, def: d }
  fns.set(id, fn)
  // Module-level boxes, read on the client only (a server render never shows a call in flight).
  const { calls, error } = createRoot(
    () => ({ calls: state(0), error: state<unknown>(undefined) }),
    null,
  )
  const pending = createRoot(() => derived(() => calls.value > 0), null)
  const m = (input?: unknown) => mutate(fn, input, calls, error)
  return Object.assign(m, {
    kind: 'mutation',
    $id: id,
    pending,
    error: {
      get value() {
        return error.value
      },
    },
    [FN]: fn,
    [SUBMIT]: (input: unknown, form: true | FormData) => mutate(fn, input, calls, error, form),
  })
}
