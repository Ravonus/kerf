import type { Site } from '@kerf/core/ssr'

/** One diagnostic as the server reports it: what `onDiagnostic` receives. */
export interface Diagnostic {
  code: string
  severity: string
  message: string
  route?: string
  /** The request it came from (`x-request-id` on that response), when it came from one. */
  requestId?: string | undefined
}

/**
 * The server log: one line per diagnostic on stderr. `site.log: 'json'` writes JSON objects (time, level, code, message,
 * route, requestId) for a log collector; the default is a line a person reads.
 */
export function serverLog(site: Site | undefined): (d: Diagnostic) => void {
  if (site?.log === 'json')
    return (d) =>
      console.warn(
        JSON.stringify({
          time: new Date().toISOString(),
          level: d.severity,
          code: d.code,
          message: d.message.replace(/^[A-Z]{1,3}\d{3}:? /, ''),
          ...(d.route && { route: d.route }),
          ...(d.requestId && { requestId: d.requestId }),
        }),
      )
  return (d) =>
    console.warn(
      `[kerf] ${d.code} ${d.severity}${d.route ? ` (${d.route})` : ''}${d.requestId ? ` [${d.requestId}]` : ''}: ${d.message.replace(/^[A-Z]{1,3}\d{3}:? /, '')}`,
    )
}

const GIVEN = /^[\w.:-]{1,128}$/

/** The request's id: a proxy's `x-request-id` when `site.trustProxy` says one is in front, else a fresh one. */
export function requestIdOf(request: Request, site: Site | undefined): string {
  const given = request.headers.get('x-request-id')
  return site?.trustProxy && given && GIVEN.test(given) ? given : crypto.randomUUID()
}
