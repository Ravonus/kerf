import { mergeMeta } from '@kerf-js/core/ssr'
import { rt } from '@kerf-js/core/internal'
import type { Scope } from '../exec'
import {
  ERROR_ROUTE,
  FALLBACK_ROUTE,
  errorData,
  errorDetails,
  errorReference,
  isErrorRoute,
} from '../failure'
import type { HandlerOptions, Level, Resolved } from './types'
import { failureDefaults } from './failure-defaults'
import { presentFailure } from './failure-value'

export { captureFailure, createFailureCapture, presentFailure } from './failure-value'
export type {
  FailureCapture,
  FailureDebug,
  FailureOccurrence,
  FailureOptions,
} from './failure-value'

/** A render fault tagged with the outlet that owns it. */
export class RenderFailure extends Error {
  constructor(
    readonly depth: number,
    cause: unknown,
  ) {
    super('Route render failed', { cause })
  }
}

/** Resolve the entire server view here, including lazy children, to locate render errors. */
export function renderLevel(depth: number, body: () => unknown) {
  try {
    return { t: rt.resolve!(body) }
  } catch (error) {
    throw error instanceof RenderFailure ? error : new RenderFailure(depth, error)
  }
}

/** Reserve one reference for this response, even if its stream has yet to fail. */
export const referenceOf = (scope: Scope) => (scope.failure.reference ??= errorReference())

/** Give authored Boundaries and resources the same safe representation before serialization. */
export function showRenderFailures(scope: Scope, options: HandlerOptions, path: string) {
  const safe = new WeakSet<Error>()
  scope.failure.show ??= (error) => {
    if (error instanceof Error && safe.has(error)) return error
    const data = reportFailure(scope, options, error, {
      status: 500,
      code: 'E_RENDER',
      route: path,
      publicMessage: failureDefaults.E_FN.message,
    })
    const shown = Object.assign(new Error(data.message), {
      reference: data.reference,
      stack: data.stack,
    })
    safe.add(shown)
    return shown
  }
}

/** Record the original fault on the server and return its public representation. */
export function reportFailure(
  scope: Scope,
  options: HandlerOptions,
  error: unknown,
  {
    status,
    code,
    route,
    publicMessage = failureDefaults.E_ROUTE.message,
  }: { status: number; code: string; route?: string | undefined; publicMessage?: string },
) {
  const reference = referenceOf(scope)
  const details = errorDetails(error)
  options.onDiagnostic?.({
    code,
    severity: 'error',
    message: details.stack ?? details.message,
    requestId: scope.requestId,
    reference,
    ...(route && { route }),
  })
  if (options.dev) return errorData(error, status, reference, true)
  const projected = presentFailure({
    publicFailure: { code, status, message: publicMessage },
    reference,
    includeReference: true,
  })
  return { status: projected.status, message: projected.message, reference }
}

/** Replace the failed outlet and its descendants with the site's error view. */
function failRoute(
  r: Resolved,
  scope: Scope,
  options: HandlerOptions,
  depth: number,
  error: unknown,
) {
  const failed = r.levels[depth]
  const status = 500
  const data = reportFailure(scope, options, error, { status, code: 'E_RENDER', route: failed?.id })
  const id = failed && isErrorRoute(failed.id) ? FALLBACK_ROUTE : ERROR_ROUTE
  const fallback: Level = { id, params: {}, data, raw: data }
  r.levels = [...r.levels.slice(0, depth), fallback]
  r.status = status
  r.error = error
  delete r.route
  delete r.metas
  r.head = mergeMeta(options.site, { title: 'Error' })
  if (r.origin) r.head.url = r.origin
  return data
}

/** Keep rendering successful ancestors until a complete error shell can be sent. */
export async function recoverRender<T>(
  r: Resolved,
  scope: Scope,
  options: HandlerOptions,
  render: () => Promise<T>,
): Promise<T> {
  for (;;) {
    try {
      return await render()
    } catch (error) {
      const depth = error instanceof RenderFailure ? error.depth : 0
      if (r.levels[depth]?.id === FALLBACK_ROUTE) throw error
      failRoute(r, scope, options, depth, error instanceof RenderFailure ? error.cause : error)
    }
  }
}
