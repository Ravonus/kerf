import { FnError, isRedirect, StartError } from '../data'
import type { Scope, ScopeEntry } from './scope'

/** How long a landed read waits for the others in flight, in ms: long enough for a pool's worth of replies. */
const GATHER = 4

interface Landing {
  flying: number
  held: (() => void)[]
  timer?: ReturnType<typeof setTimeout> | undefined
}
const landings = new WeakMap<object, Landing>()

/**
 * A read as a render sees it. Each landing costs a pass over the whole page, so reads land together: all of them once
 * none is in flight, or `GATHER` after the first, so a slow query never holds a fast one for longer than that.
 */
export function landed(scope: Scope, e: ScopeEntry): Promise<unknown> {
  if (e.read) return e.read
  let l = landings.get(scope.entries)
  if (!l) landings.set(scope.entries, (l = { flying: 0, held: [] }))
  const at = l
  at.flying++
  const release = () => {
    clearTimeout(at.timer)
    at.timer = undefined
    for (const go of at.held.splice(0)) go()
  }
  e.read = new Promise((ok, no) => {
    const land = () => {
      at.held.push(() => (e.e !== undefined ? no(shown(e.e, scope)) : ok(e.v)))
      if (!--at.flying) release()
      else at.timer ??= setTimeout(release, GATHER)
    }
    e.p.then(land, land)
  })
  e.read.catch(() => {}) // a failure surfaces where the value is read
  return e.read
}

const FAILED = 'Server function failed.'

/** A failure as the page may show it. In production a fault's text stays in the diagnostics: a driver's error names tables. */
export function shown(e: unknown, scope: Scope): unknown {
  const { dev, onDiagnostic } = scope.options
  const fault = !(
    e instanceof FnError ||
    isRedirect(e) ||
    (e instanceof StartError && Number(e.extra.status ?? 500) < 500)
  )
  const { message, code } = (e ?? {}) as { message?: string; code?: string }
  if (dev || !fault) {
    if (message !== undefined) scope.said.add(message)
    return e
  }
  onDiagnostic?.({
    code: code ?? 'E_FN',
    severity: 'error',
    message: `a render read a failed query: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
  })
  return new Error(FAILED)
}

/** The message for a value that's going in a page: its own when `shown` passed it, else the plain one. */
export const said = (message: string, scope: Scope) =>
  scope.options.dev || scope.said.has(message) ? message : FAILED
