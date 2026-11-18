// Application-owned routing still uses the release's function identity and output schema.
import { clientRequest } from '../client-fetch'
import { fns, fnOf } from '../data/foundation'
import type { Fn, Mutation, Query } from '../data/types'
import { admitAnswer, ShellDataError, shellHeaders, shellRequest, within } from './operation'
import { shellBuild } from './client-policy'
import { isSchema, SHELL_TIMEOUT, validOperationId } from './wire'

export async function requestShell(path: string, init: RequestInit): Promise<Response> {
  try {
    if (init.signal?.aborted) throw new ShellDataError('unavailable')
    const work = clientRequest(path, { ...init, ...shellRequest }).then((response) => {
      if (init.signal?.aborted) void response.body?.cancel().catch(() => {})
      return response
    })
    return await (init.signal ? within(work, init.signal) : work)
  } catch {
    if (init.signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError')
    throw new ShellDataError('unavailable')
  }
}

function shellAnswer(fn: Fn, response: Response, signal?: AbortSignal) {
  return admitAnswer(fn.def.output, response, {
    kind: 'fn:' + fn.$id,
    build: shellBuild(),
    ...(signal && { signal }),
  })
}

/** Admit the unread, raw Response returned for a release query or mutation by a custom transport. */
export async function admitOperation<I, O>(
  operation: Query<I, O> | Mutation<I, O>,
  response: Response,
  options: { signal?: AbortSignal } = {},
): Promise<O> {
  const fn = fnOf(operation)
  if (!fn || (fn.kind !== 'query' && fn.kind !== 'mutation') || !hasOperation(fn))
    throw new ShellDataError('invalid')
  return (await shellAnswer(fn, response, options.signal)).v as O
}

export function hasOperation(fn: Fn) {
  return fns.get(fn.$id) === fn && validOperationId(fn.$id) && isSchema(fn.def.output)
}

export async function requestOperation(id: string, path: string, init: RequestInit) {
  shellBuild()
  const fn = fns.get(id)
  if (!fn || !hasOperation(fn)) throw new ShellDataError('invalid')
  const signal = AbortSignal.timeout(SHELL_TIMEOUT)
  const headers = new Headers(init.headers)
  headers.set('accept', shellHeaders.accept)
  try {
    const response = await requestShell(path, { ...init, headers, signal })
    return await shellAnswer(fn, response, signal)
  } catch (error) {
    throw signal.aborted ? new ShellDataError('unavailable') : error
  }
}
