import { cache } from './cache'
import { currentScope, fns, net, rt, runtime, skip } from './foundation'
import { FnError, keyOf, StartError } from './primitives'
import { fakeScope, track } from './transport'

/** What `live.ts` reads from here; see its header. */
export const liveApi = {
  cache,
  currentScope,
  fakeScope,
  fns,
  FnError,
  keyOf,
  net,
  rt,
  runtime,
  skip,
  StartError,
  track,
}
/** What `live.ts` is handed, instead of a static import that would close a cycle. */
export type LiveApi = typeof liveApi
