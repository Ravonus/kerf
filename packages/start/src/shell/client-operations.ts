// Application-owned routing still uses the release's function identity and output schema.
import { clientRequest } from '../client-fetch'
import { fns, fnOf } from '../data/foundation'
import type { Mutation, Query } from '../data/types'
import { admitAnswer, ShellDataError, shellHeaders, shellRequest } from './operation'
import { shellBuild } from './client-policy'
import { SHELL_TIMEOUT } from './wire'

export async function requestShell(path: string, init: RequestInit): Promise<Response> {
  try {
    return await clientRequest(path, { ...init, ...shellRequest })
  } catch {
    if (init.signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError')
    throw new ShellDataError('unavailable')
  }
}

export async function shellAnswer(id: string, response: Response, signal?: AbortSignal) {
  return admitAnswer(fns.get(id)?.def.output, response, {
    kind: 'fn:' + id,
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
  if (!fn || (fn.kind !== 'query' && fn.kind !== 'mutation')) throw new ShellDataError('invalid')
  return (await shellAnswer(fn.$id, response, options.signal)).v as O
}

export async function requestOperation(id: string, path: string, init: RequestInit) {
  shellBuild()
  if (!fns.get(id)?.def.output) throw new ShellDataError('invalid')
  const signal = AbortSignal.timeout(SHELL_TIMEOUT)
  const headers = new Headers(init.headers)
  headers.set('accept', shellHeaders.accept)
  try {
    const response = await requestShell(path, { ...init, headers, signal })
    return await shellAnswer(id, response, signal)
  } catch (error) {
    throw signal.aborted ? new ShellDataError('unavailable') : error
  }
}
