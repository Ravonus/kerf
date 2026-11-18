// Operations and bootstrap use a single, bounded frame with no peer error details.
import { FnError } from '../data/primitives'
import type { RouteSchema } from '../shell'
import { frames } from './read'
import {
  fields,
  SHELL_BYTES,
  SHELL_FRAME_BYTES,
  SHELL_MEDIA,
  SHELL_TIMEOUT,
  SHELL_VERSION,
  validate,
} from './wire'

const errors = {
  invalid: [502, 'Invalid shell data.'],
  unavailable: [503, 'The data peer is unavailable.'],
  bad_request: [400, 'The request was refused.'],
  unauthorized: [401, 'Sign in to continue.'],
  forbidden: [403, 'The action is not allowed.'],
  missing: [404, 'The operation is unavailable.'],
  method: [405, 'The method is not allowed.'],
  conflict: [409, 'The action conflicts with current data.'],
  too_large: [413, 'The request is too large.'],
  invalid_input: [422, 'The action input was refused.'],
  rate_limited: [429, 'Too many requests.'],
  failed: [500, 'The operation failed.'],
} as const

/** A closed set of local shell transport errors. */
export type ShellErrorCode = keyof typeof errors

/** An operation or bootstrap error with a fixed release-owned message. */
export class ShellDataError extends FnError {
  declare readonly code: ShellErrorCode

  constructor(code: ShellErrorCode) {
    const [status, message] = errors[code]
    super({ code, message }, status)
    this.name = 'ShellDataError'
  }
}

export function peerStatus(status: unknown): ShellErrorCode {
  const code = (Object.keys(errors) as ShellErrorCode[]).find(
    (key) => key !== 'invalid' && errors[key][0] === status,
  )
  return code ?? 'failed'
}

export function errorFrameStatus(code: ShellErrorCode) {
  return errors[code][0]
}

export function peerError(code: unknown, status?: number): ShellDataError {
  if (typeof code !== 'string' || code === 'invalid' || !Object.hasOwn(errors, code))
    return new ShellDataError('invalid')
  const error = new ShellDataError(code as ShellErrorCode)
  return status === undefined || status === error.status ? error : new ShellDataError('invalid')
}

export const shellHeaders = { accept: SHELL_MEDIA }
export const shellRequest = { redirect: 'error', credentials: 'omit', cache: 'no-store' } as const

export const shellMedia = (type: string | null) =>
  /^application\/x-ndjson(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(type ?? '')

export function wireFrame(build: string | null, kind: string, value: unknown) {
  return { v: SHELL_VERSION, build, kind, value }
}

export function wireValue(frame: unknown, build: string | null, kind: string) {
  if (
    !fields(frame, ['v', 'build', 'kind', 'value']) ||
    frame.v !== SHELL_VERSION ||
    frame.build !== build ||
    frame.kind !== kind
  )
    throw new ShellDataError('invalid')
  return frame.value
}

const text = new TextEncoder()

export function shellResponse(build: string | null, kind: string, value: unknown, status = 200) {
  const line = JSON.stringify(wireFrame(build, kind, value)) + '\n'
  if (text.encode(line).length > SHELL_FRAME_BYTES) throw new ShellDataError('invalid')
  return new Response(line, {
    status,
    headers: { 'content-type': SHELL_MEDIA, 'cache-control': 'no-store' },
  })
}

export type Target = { build: string | null; kind: string; signal?: AbortSignal | null }

export async function readValue(response: Response, target: Target) {
  const { build, kind, signal } = target
  const timeout = AbortSignal.timeout(SHELL_TIMEOUT)
  const lifetime = signal ? AbortSignal.any([signal, timeout]) : timeout
  if (
    response.redirected ||
    !shellMedia(response.headers.get('content-type')) ||
    !response.body ||
    Number(response.headers.get('content-length')) > SHELL_BYTES
  ) {
    void response.body?.cancel().catch(() => {})
    throw new ShellDataError('invalid')
  }
  const stream = frames(response.body, lifetime)
  let value: unknown
  try {
    value = wireValue((await stream.next()).value, build, kind)
    if (!(await stream.next()).done) throw new ShellDataError('invalid')
  } catch {
    if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError')
    throw new ShellDataError('invalid')
  } finally {
    await stream.return(undefined)
  }
  if (response.status === 200) return value
  if (!fields(value, ['code'])) throw new ShellDataError('invalid')
  throw peerError(value.code, response.status)
}

export async function admitValue(schema: RouteSchema | undefined, value: unknown) {
  if (!schema) throw new ShellDataError('invalid')
  try {
    return await validate(schema, value)
  } catch {
    throw new ShellDataError('invalid')
  }
}

export function tags(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 256 &&
    value.every((tag) => typeof tag === 'string' && tag.length <= 256 && !/\p{Cc}/u.test(tag))
  )
}

export async function admitAnswer(
  schema: RouteSchema | undefined,
  response: Response,
  target: Target,
) {
  const answer = await readValue(response, target)
  if (!fields(answer, ['v', 't']) || !tags(answer.t)) throw new ShellDataError('invalid')
  return { v: await admitValue(schema, answer.v), t: answer.t }
}
