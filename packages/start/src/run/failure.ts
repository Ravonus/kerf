import type { State } from '@kerf-js/core'
import { ERROR_ROUTE, FALLBACK_ROUTE, isErrorRoute, browserFailure } from '../failure'
import type { RouteErrorData } from '../failure'
import type { Match, RoutePayload } from '../router'
import type { Navigation } from './navigation'
import { guess } from './helpers'

/** A chunk failed at an identifiable outlet. */
export class RouteChunkError extends Error {
  constructor(
    readonly depth: number,
    cause: unknown,
  ) {
    super('Route module failed to load', { cause })
  }
}

/** A browser-only fault is correlated with a browser diagnostic. Server failures keep their own reference. */
export function clientFailure(error: unknown): RouteErrorData {
  return browserFailure(error, 500, 'Route failed')
}

/** The replacement outlet sent by a stream after its shell. */
export interface LateFailure {
  depth: number
  data: RouteErrorData
}

/** Load the app's error view when available. The built-in stays available even if the app chunk is missing. */
export async function errorPayload(
  path: string,
  prefix: Match[],
  data: RouteErrorData,
  chunk: (id: string, retry?: boolean) => Promise<void>,
  builtin: boolean,
): Promise<RoutePayload> {
  let id = builtin ? FALLBACK_ROUTE : ERROR_ROUTE
  try {
    await chunk(id, true)
  } catch {
    id = FALLBACK_ROUTE
  }
  return { m: [...prefix, { id, params: {}, data }], p: path, s: data.status }
}

/** Make all route code ready, preferring the outermost failed outlet. */
export async function needChunks(
  next: RoutePayload,
  chunk: Navigation['chunk'],
  island: Navigation['island'],
  retry?: boolean,
) {
  const failed = await Promise.all([
    ...next.m.map((m, depth) => chunk(m.id, retry).catch((e) => new RouteChunkError(depth, e))),
    ...(next.i ?? []).map((id) =>
      island(id)?.catch(
        (e) =>
          new RouteChunkError(
            next.m.findIndex((m) => m.s),
            e,
          ),
      ),
    ),
  ])
  const first = failed.find((error) => error !== undefined)
  if (first) throw first
}

/** Replace the unavailable outlet after waiting for its surviving layouts. */
export async function routeChunks(
  nav: Navigation,
  next: RoutePayload,
  path: string,
  signal: AbortSignal,
  retry?: boolean,
) {
  try {
    await nav.needs(next, retry)
    return next
  } catch (error) {
    if (!(error instanceof RouteChunkError)) throw error
    if (signal.aborted) return next
    const depth = Math.max(0, error.depth)
    const previous = next.m[depth]
    const builtin = isErrorRoute(previous?.id ?? '')
    const data = builtin ? (previous!.data as RouteErrorData) : clientFailure(error.cause)
    return errorPayload(path, next.m.slice(0, depth), data, nav.chunk, builtin)
  }
}

/** Show a failed route read under the common, already-mounted layouts. */
export async function failRead(
  nav: Navigation,
  url: URL,
  path: string,
  ctrl: AbortController,
  error: unknown,
) {
  const layouts = guess(nav.routes, url.pathname).slice(0, -1)
  const depth = layouts.findIndex((id, d) => nav.matches[d]?.id !== id)
  const prefix = nav.matches.slice(0, depth < 0 ? layouts.length : depth)
  const failure = await errorPayload(path, prefix, clientFailure(error), nav.chunk, false)
  if (nav.current === ctrl && !ctrl.signal.aborted)
    nav.apply(failure, url, path, nav.now(), false)()
}

/** Link the outlet's reactive recovery controls to this tab's navigation owner. */
export function connectRecovery(
  nav: Navigation,
  pending: State<boolean>,
  recovery?: { retry?: () => Promise<void>; fail?: (depth: number, error: unknown) => void },
) {
  if (!recovery) return
  let retrying: Promise<void> | undefined
  recovery.retry = () => {
    if (retrying) return retrying
    pending.value = true
    retrying = nav.go(location.href, { reload: true, scroll: false, shared: false }).finally(() => {
      retrying = undefined
      pending.value = false
    })
    return retrying
  }
  recovery.fail = (depth, error) => void failOutlet(nav, depth, clientFailure(error))
}

/** Replace a currently mounted outlet. A newer navigation owns any later commit. */
export async function failOutlet(nav: Navigation, depth: number, data: RouteErrorData) {
  const owner = nav.current
  const matches = nav.matches
  const url = new URL(location.href)
  const path = url.pathname + url.search
  const next = await errorPayload(
    path,
    matches.slice(0, Math.max(0, depth)),
    data,
    nav.chunk,
    isErrorRoute(matches[depth]?.id ?? ''),
  )
  if (
    nav.matches !== matches ||
    (nav.current && nav.current !== owner) ||
    owner?.signal.aborted ||
    location.href !== url.href
  )
    return
  nav.apply(next, url, path, nav.now(), false)()
}
