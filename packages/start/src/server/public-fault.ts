import type { PublicFailure } from '@kerf-js/core/errors'
import { errorDetails, errorReference } from '../failure'
import type { Diagnostic } from './log'
import type { SchemaIssue } from '../data'
import { presentFailure } from './failure-value'

/** Start's additive failure fields preserve clients that read the original reference and stack. */
export type WireFailure = PublicFailure & { reference: string; stack?: string }

/** Inputs shared by request and realtime diagnostic owners. */
export interface FailureReporter {
  dev?: boolean | undefined
  onDiagnostic?: ((d: Diagnostic) => void) | undefined
  requestId?: string | undefined
}

interface Details {
  code: string
  status: number
  message: string
  route?: string | undefined
}

/** Emit the private fault and construct the only fields allowed to cross the transport. */
export function projectFault(
  reporter: FailureReporter,
  error: unknown,
  { code, status, message, route }: Details,
  reference = errorReference(),
  emit = true,
): WireFailure {
  const debug = errorDetails(error)
  if (emit)
    reporter.onDiagnostic?.({
      code,
      severity: 'error',
      message: diagnosticText(error, debug.stack ?? debug.message),
      requestId: reporter.requestId,
      reference,
      ...(route && { route }),
    })
  return {
    ...presentFailure({
      publicFailure: { code, status, message },
      includeReference: true,
      reference,
    }),
    reference,
    ...(reporter.dev && debug),
  }
}

function diagnosticText(error: unknown, text: string) {
  try {
    const cause = error instanceof Error && Object.getOwnPropertyDescriptor(error, 'cause')?.value
    if (cause) text += `\nCaused by: ${errorDetails(cause).message}`
  } catch {
    // Hostile thrown values still receive a reference.
  }
  return text.slice(0, 8000)
}

/** A status from a trusted error class still carries private text by default. */
export function failureMessage(status: number, fallback: string) {
  switch (status) {
    case 400:
      return 'Invalid request.'
    case 401:
      return 'Sign in required.'
    case 403:
      return 'Access denied.'
    case 404:
      return 'Not found.'
    case 405:
      return 'Method not allowed.'
    case 409:
      return 'The request conflicts with the current state.'
    case 413:
      return 'Request body too large.'
    case 422:
      return 'Check the submitted fields.'
    case 429:
      return 'Too many requests.'
    default:
      return fallback
  }
}

/** Preserve intentional domain identifiers while keeping arbitrary exception properties off the wire. */
export function failureCode(code: string | undefined, fallback: string) {
  return code && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/.test(code) ? code : fallback
}

/** Preserve field paths while limiting messages to approved text or development mode. */
export function publicIssues(issues: SchemaIssue[] | undefined, detailed: boolean | undefined) {
  return issues?.map((issue) => {
    const path = issue.path
      ?.map((part) => (typeof part === 'object' ? part.key : part))
      .filter((part) => typeof part === 'string' || typeof part === 'number')
    return { message: detailed ? issue.message : 'Invalid value.', ...(path && { path }) }
  })
}
