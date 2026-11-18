// Realtime transports share status and reference fields while keeping their existing frame and close codes.
import { FnError, StartError, type SchemaIssue } from '../data'
import type { ScopeOptions } from '../exec'
import { failureCode, failureMessage, projectFault, publicIssues } from './public-fault'

export interface RealtimeFailure {
  code: string
  message: string
  status: number
  ref?: string
  reference?: string
  issues?: SchemaIssue[]
}

const statuses: Record<string, number> = {
  A002: 401,
  A006: 403,
  Q002: 400,
  Q009: 404,
  R009: 429,
  R011: 403,
}

/** Legacy exceptions contribute a status and a code. Only the observer sees their detail in production. */
export function realtimeFault(
  options: ScopeOptions,
  error: unknown,
  route: string,
  defaultStatus = 500,
): RealtimeFailure {
  const known = error instanceof StartError || error instanceof FnError
  const code = failureCode(known ? error.code : undefined, 'E_RT')
  const given = known ? (error.status ?? statuses[code] ?? defaultStatus) : defaultStatus
  const status = Number.isInteger(given) && given >= 400 && given <= 599 ? given : 500
  const message = failureMessage(status, 'Realtime operation failed.')
  if (known && status < 500) {
    const issues = publicIssues(error.issues, options.dev)
    return {
      code,
      status,
      message: options.dev ? error.message : message,
      ...(issues && { issues }),
    }
  }
  const projected = projectFault(options, error, { code, status, message, route })
  return {
    code,
    status,
    message: projected.message,
    ref: projected.ref!,
    reference: projected.reference,
  }
}
