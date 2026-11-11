import type { Context, Fn } from '../data'
import type { Scope, Touched } from './scope'

/** A body in another process (research 36): what it adds to the tags and reports it touched arrive with the value. */
export async function callImpl(
  fn: Fn,
  input: unknown,
  ctx: Context,
  scope: Scope,
  track: { touched?: Touched | undefined; added: string[] },
) {
  const { touched, added } = track
  const {
    value,
    tags,
    touched: tables,
  } = await fn.def.impl!.call({ fn, input, ctx, request: scope.request })
  added.push(...tags)
  if (touched) for (const t of tables) touched[fn.kind === 'query' ? 'read' : 'write'].add(t)
  return value
}
