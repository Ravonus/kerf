// Warm on invalidate: a `cache: { warm: true }` query runs again in the background the moment a change invalidates it,
// so the shared store holds the new value before the next visitor asks. The visitor after an edit gets a hit, not the
// edit's cost. Only queries every visitor shares (no `auth`, no `scope: 'user'`) qualify: a warm run has no user.
import type { Fn } from '../data'
import type { Scope } from './scope'

type Warm = { fn: Fn; input: unknown; tags: string[] }

/** What was stored warm, by its store key. Bounded: a query keyed by free input can't grow it without end. */
const known = new Map<string, Warm>()
const MOST = 500

/** Whether `fn`'s stored value should come back warm after an invalidation. */
export const warms = (fn: Fn) => !!fn.def.cache?.warm && !fn.def.cache.scope && !fn.def.auth

export function remember(key: string, fn: Fn, input: unknown, tags: string[]) {
  known.delete(key)
  known.set(key, { fn, input, tags })
  if (known.size > MOST) known.delete(known.keys().next().value!)
}

/**
 * After `tags` were bumped: run each remembered query that reads one of them again, in a scope of its own (no cookies,
 * so no user and no preview), once the current task is done. A failure is a diagnostic; the next visitor runs it then.
 */
export function rewarm(
  scope: Scope,
  tags: string[],
  run: (scope: Scope, fn: Fn, input: unknown) => Promise<unknown>,
  make: (request: Request) => Scope,
) {
  const due = [...known].filter(([, w]) => w.tags.some((t) => tags.includes(t)))
  if (!due.length) return
  for (const [k] of due) known.delete(k) // the run stores, and remembers, it again
  const request = new Request(new URL('/', scope.request.url))
  setTimeout(() => {
    for (const [, w] of due)
      run(make(request), w.fn, w.input).catch((e: unknown) =>
        scope.options.onDiagnostic?.({
          code: 'E_WARM',
          severity: 'warning',
          message: `warming \`${w.fn.$id}\` after ${tags.join(', ')} failed: ${e instanceof Error ? e.message : e}`,
        }),
      )
  })
}

/** Tests: forget what was remembered. */
export const forgetWarm = () => known.clear()
