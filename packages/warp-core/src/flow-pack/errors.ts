// ---- error mapping (09 §1.3): one message per cause -----------------------------------------------------------------

/** Where an error shows: by a field, in an alert, as a rate-limit countdown, a toast or a banner. */
export type FlowSurface = 'field' | 'alert' | 'rate-limit' | 'toast' | 'banner'

/** One error, mapped to the one place it shows and what it says. */
export interface FlowError {
  surface: FlowSurface
  code?: string | undefined
  title: string
  description?: string | undefined
  /** By field name, for `surface: 'field'`. */
  fields: Record<string, string>
  /** "2 fields need attention", said on submit. */
  summary?: string
  /** Where focus goes. */
  focus: 'field' | 'alert' | 'stay'
  /** The live region it goes to; `undefined`: none. */
  live?: 'polite' | 'assertive' | undefined
  retryAfter?: number | undefined
  until?: string | undefined
  attemptsLeft?: number | undefined
}

/** What a server sends with an error, past the code: the fields mapFlowError reads, and whatever a domain adds. */
export type FlowData = { until?: string; retryAfter?: number; attemptsLeft?: number } & Record<
  string,
  unknown
>

interface IssueLike {
  message: string
  path?: readonly (PropertyKey | { readonly key: PropertyKey })[]
}

/** What `mapFlowError` needs beyond the error itself. */
export interface FlowErrorOptions {
  /** `online().value`: a failed submit while offline is a Banner, not a server error. */
  online?: boolean
  /** Copy by code, for a domain error the table doesn't know. */
  copy?: Record<string, string | ((data: FlowData) => string)>
}

/** Field name by field name from Zod or Standard Schema issues: `a.b`, and the first message wins. */
export function issueFields(issues: readonly IssueLike[] = []) {
  const fields: Record<string, string> = {}
  for (const i of issues) {
    const name = (i.path ?? [])
      .map((p) => String(typeof p === 'object' && p !== null ? p.key : p))
      .join('.')
    if (name) fields[name] ??= i.message
  }
  return fields
}

/** "2 fields need attention": the line said on submit. */
export const fieldSummary = (n: number) =>
  n === 1 ? '1 field needs attention' : `${n} fields need attention`

const utc = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}

const tries = (n: number | undefined) =>
  n === undefined ? '' : n === 1 ? ' 1 try left.' : ` ${n} tries left.`

/** One message per cause: what happened and what to do, in one sentence. Takes a `FnError`, anything like one, or a string. */
export function mapFlowError(
  error: unknown,
  { online = true, copy = {} }: FlowErrorOptions = {},
): FlowError {
  const e = (typeof error === 'string' ? { message: error } : (error ?? {})) as {
    code?: string
    status?: number
    message?: string
    issues?: readonly IssueLike[]
    data?: FlowData
    extra?: FlowData
    name?: string
  }
  const data: FlowData = e.data ?? e.extra ?? e
  const base = { code: e.code, fields: {} as Record<string, string> }
  const alert = (title: string, description?: string): FlowError => ({
    ...base,
    surface: 'alert',
    title,
    description,
    focus: 'alert',
    live: 'assertive',
  })
  const fields = issueFields(e.issues)
  const named = Object.keys(fields).length
  if (named)
    return {
      ...base,
      surface: 'field',
      fields,
      title: e.message ?? fieldSummary(named),
      summary: fieldSummary(named),
      focus: 'field',
      live: 'polite',
    }
  const known = e.code ? copy[e.code] : undefined
  if (known) return alert(typeof known === 'function' ? known(data) : known)
  const specific = specificError(e.code, data, base, alert)
  if (specific) return specific
  if (e.code === 'STALE_SCHEMA' || e.code === 'CONTRACT_CHANGED')
    return {
      ...base,
      surface: 'banner',
      title: 'A new version is ready.',
      description: 'Reload to finish saving.',
      focus: 'stay',
      live: 'polite',
    }
  if (!online)
    return {
      ...base,
      surface: 'banner',
      title: "You're offline.",
      description: 'Your changes are kept. Try again when you reconnect.',
      focus: 'stay',
      live: 'assertive',
    }
  if (e.name === 'TypeError' || (e.status !== undefined && (e.status === 0 || e.status >= 500)))
    return {
      ...base,
      surface: 'toast',
      title: "We couldn't reach the server.",
      description: 'Your changes are kept. Try again.',
      focus: 'stay',
      live: 'assertive',
    }
  return alert(e.message || "That didn't go through. Try again.")
}

function specificError(
  code: string | undefined,
  data: FlowData,
  base: { code: string | undefined; fields: Record<string, string> },
  alert: (title: string, description?: string) => FlowError,
): FlowError | undefined {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return alert("That email and password don't match.", 'Try again, or reset your password.')
    case 'LOCKED':
      return {
        ...alert(
          `This account is locked${data.until ? ` until ${utc(data.until)}` : ''}.`,
          'Reset your password to get back in sooner.',
        ),
        until: data.until,
      }
    case 'RATE_LIMITED':
      return {
        ...base,
        surface: 'rate-limit',
        title: 'Too many tries.',
        retryAfter: data.retryAfter,
        focus: 'stay',
        live: 'polite',
      }
    case 'WRONG_CODE':
      return {
        ...base,
        surface: 'field',
        fields: { code: `That code didn't work.${tries(data.attemptsLeft)}` },
        title: `That code didn't work.${tries(data.attemptsLeft)}`,
        attemptsLeft: data.attemptsLeft,
        focus: 'field',
        live: 'assertive',
      }
    case 'EXPIRED':
      return {
        ...base,
        surface: 'field',
        fields: { code: 'That code expired. We sent a new one.' },
        title: 'That code expired. We sent a new one.',
        focus: 'field',
        live: 'assertive',
      }
    case undefined:
    default:
      break
  }
  return undefined
}
