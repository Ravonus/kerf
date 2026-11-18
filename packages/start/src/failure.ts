import { DEV } from '@kerf-js/core'

/** Safe data for a failed route. Stack traces are available in development. */
export interface RouteErrorData {
  status: number
  message: string
  reference: string
  code?: string
  ref?: string
  stack?: string
}

/** Props for `src/routes/_error.tsx`. Read `pending` reactively while retry is in flight. */
export interface ErrorRouteProps {
  data: RouteErrorData
  retry: () => Promise<void>
  pending: boolean
}

export const ERROR_HEADER = 'x-kerf-error'
export const ERROR_ROUTE = 'error'
export const FALLBACK_ROUTE = '$error'
export const LATE_ERROR = 'kerf-route-error'

/** An independent 96-bit reference, safe to share and available on plain HTTP. */
export function errorReference(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('')
}

export function referenceFrom(error: unknown): string | undefined {
  const value = error instanceof Error && (error as Error & { reference?: unknown }).reference
  return isErrorReference(value) ? value : undefined
}

/** The opaque reference format shared by Start's server and browser. */
export const isErrorReference = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{24}$/.test(value)

export function errorDetails(error: unknown) {
  try {
    if (error instanceof Error)
      return {
        message: typeof error.message === 'string' ? error.message : 'Unknown error',
        ...(typeof error.stack === 'string' && { stack: error.stack }),
      }
    return { message: String(error) }
  } catch {
    return { message: 'Unknown error' }
  }
}

export function errorData(error: unknown, status: number, reference: string, dev?: boolean) {
  return {
    status,
    reference,
    ...(dev ? errorDetails(error) : { message: 'Something went wrong.' }),
  } satisfies RouteErrorData
}

export function isErrorRoute(id: string) {
  return id === ERROR_ROUTE || id === FALLBACK_ROUTE
}

/** Correlate faults that only the browser observed with its own diagnostic. */
export function browserFailure(error: unknown, status: number, label: string) {
  const remote = referenceFrom(error)
  const data = errorData(error, status, remote ?? errorReference(), DEV)
  if (!remote)
    console.error(`[kerf] ${label} [reference ${data.reference}]`, ...(DEV ? [error] : []))
  return data
}
