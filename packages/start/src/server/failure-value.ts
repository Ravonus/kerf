import type { JsonValue, PublicFailure } from '@kerf-js/core/errors'
import { errorReference, isErrorReference } from '../failure'
import { failureDefaults } from './failure-defaults'

type ApprovedFailure = Omit<PublicFailure, 'ref'>

interface FailurePresentation {
  readonly publicFailure: ApprovedFailure
  readonly reference: string
  readonly includeReference: boolean
  readonly debug?: FailureDebug
}

/** Redacted development detail supplied by the owner. Capture never builds it from the raw throw. */
export interface FailureDebug {
  readonly message?: string
  readonly stack?: string
  readonly source?: string
  readonly causes?: readonly string[]
}

/** The original throw remains private to the operation that owns the failure. */
export interface FailureOccurrence extends FailurePresentation {
  readonly classification: 'expected' | 'fault'
  readonly surface: string
  readonly operation?: string
  readonly cause: unknown
  readonly context?: unknown
}

/** One request or attempt owns its own object identities and optional reserved response reference. */
export function createFailureCapture(reference?: string) {
  const occurrences = new WeakMap<object, FailureOccurrence>()
  return {
    occurrences,
    claimReference(useReservation: boolean) {
      if (useReservation && isErrorReference(reference)) {
        const reserved = reference
        reference = undefined
        return reserved
      }
      return errorReference()
    },
  }
}

/** The attempt, explicitly passed by a caller that owns rendering, replying or settlement. */
export type FailureCapture = ReturnType<typeof createFailureCapture>

/** A registry fault code, or an explicitly approved refusal supplied by the owning adapter. */
export type FailureOptions = {
  surface: string
  operation?: string
  context?: unknown
  debug?: FailureDebug
} & (
  | { code?: keyof typeof failureDefaults; expected?: never; includeReference?: never }
  | { code?: never; expected: ApprovedFailure; includeReference?: boolean }
)

function approved(error: ApprovedFailure): ApprovedFailure {
  const { code, status, message, issues, data } = error
  if (typeof code !== 'string' || typeof message !== 'string' || !Number.isInteger(status))
    throw new TypeError('Invalid public failure')
  return Object.freeze({
    code,
    status,
    message,
    ...(issues !== undefined && {
      issues: Object.freeze(
        issues.map(({ message: issueMessage, path }) => {
          if (
            typeof issueMessage !== 'string' ||
            (path !== undefined &&
              (!Array.isArray(path) ||
                path.some(
                  (part) =>
                    typeof part !== 'string' &&
                    (typeof part !== 'number' || !Number.isFinite(part)),
                )))
          )
            throw new TypeError('Invalid public field issue')
          return Object.freeze({
            message: issueMessage,
            ...(path !== undefined && { path: Object.freeze([...path]) }),
          })
        }),
      ),
    }),
    ...(data !== undefined && { data: snapshotJson(data) }),
  })
}

function snapshotJson(value: unknown, active = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object' || value === null || active.has(value))
    throw new TypeError('Invalid public failure data')
  const array = Array.isArray(value)
  const proto: unknown = Object.getPrototypeOf(value)
  if (!array && proto !== null && proto !== Object.prototype)
    throw new TypeError('Public failure data must be plain JSON')
  active.add(value)
  const keys = array
    ? Array.from({ length: value.length }, (_, index) => String(index))
    : Object.keys(value)
  const entries = keys.map((key) => {
    const property = Object.getOwnPropertyDescriptor(value, key)
    if (!property?.enumerable || !Object.hasOwn(property, 'value'))
      throw new TypeError('Public failure data must use own values')
    return [key, snapshotJson(property.value, active)] as const
  })
  active.delete(value)
  return Object.freeze(array ? entries.map(([, item]) => item) : Object.fromEntries(entries))
}

function boundedDebug({ message, stack, source, causes }: FailureDebug): FailureDebug {
  return Object.freeze({
    ...(message !== undefined && { message: message.slice(0, 512) }),
    ...(stack !== undefined && { stack: stack.slice(0, 2048) }),
    ...(source !== undefined && { source: source.slice(0, 256) }),
    ...(causes !== undefined && {
      causes: Object.freeze(causes.slice(0, 4).map((c) => c.slice(0, 256))),
    }),
  })
}

/**
 * Claim a failure already distinguished from control flow by its owner. Keep the original value intact,
 * including cross-realm errors and cyclic or aggregate causes. Pass the returned handle on for primitive throws.
 */
export function captureFailure(
  thrown: unknown,
  capture: FailureCapture,
  options: FailureOptions,
): FailureOccurrence {
  const object =
    (typeof thrown === 'object' && thrown !== null) || typeof thrown === 'function'
      ? thrown
      : undefined
  const previous = object && capture.occurrences.get(object)
  if (previous) return previous

  let expected: ApprovedFailure | undefined
  if (options.expected && options.expected.status >= 400 && options.expected.status < 500) {
    try {
      expected = approved(options.expected)
    } catch {
      // A broken approval cannot promote private data into a public refusal.
    }
  }
  const code =
    options.code && Object.hasOwn(failureDefaults, options.code) ? options.code : 'E_REQUEST'
  const occurrence: FailureOccurrence = Object.freeze({
    classification: expected ? 'expected' : 'fault',
    surface: options.surface,
    ...(options.operation !== undefined && { operation: options.operation }),
    ...(options.context !== undefined && { context: options.context }),
    ...(options.debug && { debug: boundedDebug(options.debug) }),
    cause: thrown,
    reference: capture.claimReference(!expected),
    includeReference: !expected || options.includeReference === true,
    publicFailure: expected ?? Object.freeze({ code, ...failureDefaults[code] }),
  })
  if (object) capture.occurrences.set(object, occurrence)
  capture.occurrences.set(occurrence, occurrence)
  return occurrence
}

/** Project approved facts only. The caller maps this value to its existing transport. */
export function presentFailure(
  failure: FailurePresentation,
  mode: 'production' | 'development' = 'production',
): PublicFailure & { readonly debug?: FailureDebug } {
  const { code, message, status, issues, data } = failure.publicFailure
  return Object.freeze({
    code,
    message,
    status,
    ...(failure.includeReference && { ref: failure.reference }),
    ...(issues !== undefined && { issues }),
    ...(data !== undefined && { data }),
    ...(mode === 'development' && failure.debug && { debug: failure.debug }),
  })
}
