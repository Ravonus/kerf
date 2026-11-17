import type { SsrData } from '../index/types'

type FailureRecord = SsrData['r'][string]

/** Keep a host-sanitized failure's reference across the SSR and hydration boundary. */
export function errorRecord(error: unknown): FailureRecord {
  if (error instanceof Error) {
    const { message, stack, reference } = error as Error & { reference?: string }
    return { e: message, ...(reference && { reference, ...(stack && { stack }) }) }
  }
  return { e: String(error) }
}

/** Restore the error data shared with the hydrating page. */
export function restoreError(record?: FailureRecord) {
  const error = new Error(record?.e ?? 'server render failed')
  if (record?.reference) Object.assign(error, { reference: record.reference, stack: record.stack })
  return error
}
