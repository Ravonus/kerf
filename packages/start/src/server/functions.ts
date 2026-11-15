import { sessionChanged } from '../auth'
import { fns, isRedirect } from '../data'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { bodyLimit, limited, multipartBody, withHeaders } from './request'
import type { HandlerOptions } from './types'
import { functionFault } from './function-fault'
import { failureMessage } from './public-fault'
import { ERROR_HEADER } from '../failure'
import { admitValue, errorFrameStatus, peerStatus, shellResponse, tags } from '../shell/operation'
import { isSchema, validOperationId } from '../shell/wire'
import type { Answer, Fn } from '../data/types'
import { externalOrigin } from './origin'

/** `/_kerf/fn/<id>`: GET runs a query, POST a mutation (CSRF-checked), both answering JSON (research 27 §3). */
export async function serverFunction(
  options: HandlerOptions,
  url: URL,
  request: Request,
  scope: Scope,
): Promise<Response> {
  const shell = options.site?.render === 'shell'
  const segment = url.pathname.slice('/_kerf/fn/'.length)
  let id: string
  try {
    id = decodeURIComponent(segment)
  } catch {
    return functionResponses(scope, options, segment).fail(
      'Q002',
      'Invalid function ID encoding',
      400,
    )
  }
  const { out, fail } = functionResponses(scope, options, id)
  const f = fns.get(id)
  if (!f || (shell && !validOperationId(id)))
    return fail(
      'Q009',
      `Q009: no server function \`${id}\` (the page is older than the server, or the module isn't a server module): reload`,
      404,
    )
  if (f.kind !== 'query' && f.kind !== 'mutation')
    return fail('Q010', `Q010: \`${id}\` uses the realtime transport`, 405)
  if (shell && !isSchema(f.def.output)) return fail('Q009', 'Missing operation contract', 404)
  let fromForm = false
  try {
    if (f.kind === 'query') {
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return fail('Q010', `Q010: \`${id}\` is a query: GET only`, 405, 'GET, HEAD')
      const raw = url.searchParams.get('i')
      let input: unknown
      try {
        input = raw === null ? undefined : JSON.parse(raw)
      } catch {
        return fail('Q002', 'Invalid JSON input', 400)
      }
      const e = await exec.fetchQuery(scope, f, input)
      return await result({ v: e.v, t: e.tags }, f, out, shell)
    }
    if (request.method !== 'POST')
      return fail('Q010', `Q010: mutation \`${id}\` needs POST`, 405, 'POST')
    const type = request.headers.get('content-type') ?? ''
    const multipart = type.startsWith('multipart/form-data') // `<Form>` with a file; `x-kerf` still forces a preflight
    if (
      crossOrigin(options, request) ||
      request.headers.get('x-kerf') !== '1' ||
      !(multipart || type.startsWith('application/json'))
    )
      return fail(
        'Q010',
        `Q010: mutation \`${id}\` without the CSRF proof (POST + JSON + \`x-kerf: 1\`, same origin): call it through its stub`,
        403,
      )
    const body = await mutationBody(request, options, multipart)
    if (!body) return fail('Q002', 'Invalid server function body', 400)
    fromForm = !!body.c
    const refresh =
      !shell && Array.isArray(body.f) && !request.headers.has('authorization')
        ? body.f.slice(0, 200)
        : []
    const answer = await exec.runMutation(scope, f, body.i, refresh, fromForm)
    if (!shell && options.dev && sessionChanged(scope.headers))
      options.onDiagnostic?.({
        code: 'A004',
        severity: 'warning',
        message: `\`${id}\` changed the session cookie without a redirect: the tab keeps what the last session cached. \`redirect()\` after it`,
      })
    return await result(answer, f, out, shell)
  } catch (error) {
    if (!shell && isRedirect(error))
      return out({ r: error.href, ...(sessionChanged(scope.headers) && { x: 1 }) })
    const e = await functionFault(error, scope, f, fromForm)
    return out({ e }, e.status, 'reference' in e ? e.reference : undefined)
  }
}

type MutationBody = { i?: unknown; f?: [string, unknown][]; c?: 1 }

async function mutationBody(request: Request, options: HandlerOptions, multipart: boolean) {
  const read = await limited(request, bodyLimit(options.site?.limits, request))
  try {
    const value: unknown = multipart ? await multipartBody(read) : await read.json()
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as MutationBody
  } catch {
    return undefined
  }
  return undefined
}

async function result(
  answer: Answer,
  fn: Fn,
  out: ReturnType<typeof functionResponses>['out'],
  shell: boolean,
) {
  if (!shell) return out(answer)
  const value = await admitValue(fn.def.output, answer.v)
  if (!tags(answer.t)) throw new Error('Invalid shell operation tags')
  return out({ v: value, t: answer.t })
}

function functionResponses(scope: Scope, options: HandlerOptions, id: string) {
  const { site, build, dev } = options
  const operation = 'fn:' + id
  const shell = site?.render === 'shell'
  const error = (status: number) => {
    const code = peerStatus(status)
    return shellResponse(build ?? null, operation, { code }, errorFrameStatus(code))
  }
  const out = (body: unknown, status = 200, reference?: string) => {
    const response = shell
      ? status === 200
        ? shellResponse(build ?? null, operation, body)
        : error(status)
      : Response.json(body, { status })
    if (shell) return response
    const res = withHeaders(response, scope)
    res.headers.set('cache-control', 'no-store') // a function's answer is never stored, whatever it set
    if (reference) res.headers.set(ERROR_HEADER, reference)
    return res
  }
  const fail = (code: string, message: string, status: number, allow?: string) => {
    if (shell) return error(status)
    const response = out(
      {
        e: {
          code,
          status,
          message: dev ? message : failureMessage(status, 'Server function failed.'),
        },
      },
      status,
    )
    if (allow) response.headers.set('allow', allow)
    return response
  }
  return { out, fail }
}

function crossOrigin(options: HandlerOptions, request: Request) {
  const expected = externalOrigin(request, options.site?.trustProxy)
  if (!expected) return true
  const origin = request.headers.get('origin')
  const from = request.headers.get('sec-fetch-site')
  // Naming an origin permits its mutation; CORS separately decides whether the browser can read it.
  const named = options.site?.mutationOrigins
  const trusted = !!origin && !!named && (named === '*' || named.includes(origin))
  return (
    !trusted &&
    ((origin && origin !== expected) || (from && from !== 'same-origin' && from !== 'none'))
  )
}
