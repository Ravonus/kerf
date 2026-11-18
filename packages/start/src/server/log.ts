import type { Site } from '@kerf-js/core/ssr'
import { diagnosticLine } from './log-line.mjs'

/** One diagnostic as the server reports it: what `onDiagnostic` receives. */
export interface Diagnostic {
  code: string
  severity: string
  message: string
  route?: string
  /** The request it came from (`x-request-id` on that response), when it came from one. */
  requestId?: string | undefined
  /** An opaque failure reference (`x-kerf-error` on the response). */
  reference?: string
}

const runtime = globalThis as { process?: { env?: { NODE_ENV?: string } } }

/** Format Start diagnostics for stderr. An explicit site format takes precedence over the server mode. */
export function serverLog(
  site: Site | undefined,
  dev = runtime.process?.env?.NODE_ENV !== 'production',
) {
  const format = site?.log ?? (dev ? 'text' : 'json')
  return (d: Diagnostic) => console.warn(diagnosticLine(d, format))
}

const GIVEN = /^[\w.:-]{1,128}$/

/** The request's id: a proxy's `x-request-id` when `site.trustProxy` says one is in front, else a fresh one. */
export function requestIdOf(request: Request, site: Site | undefined): string {
  const given = request.headers.get('x-request-id')
  return site?.trustProxy && given && GIVEN.test(given) ? given : crypto.randomUUID()
}
