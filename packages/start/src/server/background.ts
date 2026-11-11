import type { Context } from '../data'
import * as exec from '../exec'
import type { Scope, ScopeOptions, Store } from '../exec'

/** What work outside a request (cron, queued jobs) needs from the server. */
export interface BackgroundDeps {
  scopeOptions: ScopeOptions
  store: Store
  boot: () => Promise<void>
  origin: string
  enter: (scope: Scope, run: () => Promise<void>) => Promise<void>
}

/**
 * Runs `work` with the app's `ctx`, as if for a request to `path` with no user: the scope's services, the cache,
 * and invalidations all work as they do in a request. What `work` throws reaches the caller.
 */
export async function inScope(
  deps: BackgroundDeps,
  path: string,
  work: (ctx: Context) => unknown,
): Promise<void> {
  const scope = exec.createScope(new Request(`${deps.origin}${path}`), deps.scopeOptions)
  try {
    await deps.boot()
    await deps.enter(scope, async () => {
      await work(await scope.ctx())
    })
  } finally {
    void exec.finishScope(scope)
  }
}

export const errorText = (e: unknown) => (e instanceof Error ? (e.stack ?? e.message) : String(e))
