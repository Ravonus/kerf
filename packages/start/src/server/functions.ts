import { sessionChanged } from '../auth'
import { fns, isRedirect } from '../data'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { bodyLimit, limited, multipartBody, withHeaders } from './request'
import type { HandlerOptions } from './types'
import { functionFault } from './function-fault'
import { failureMessage } from './public-fault'
import { ERROR_HEADER } from '../failure'

/** `/_kerf/fn/<id>`: GET runs a query, POST a mutation (CSRF-checked), both answering JSON (research 27 §3). */
export async function serverFunction(
  options: HandlerOptions,
  url: URL,
  request: Request,
  scope: Scope,
): Promise<Response> {
  const { out, fail } = functionResponses(scope, options.dev)
  let id: string
  try {
    id = decodeURIComponent(url.pathname.slice('/_kerf/fn/'.length))
  } catch {
    return fail('Q002', 'Invalid function ID encoding', 400)
  }
  const f = fns.get(id)
  if (!f)
    return fail(
      'Q009',
      `Q009: no server function \`${id}\` (the page is older than the server, or the module isn't a server module): reload`,
      404,
    )
  if (f.kind !== 'query' && f.kind !== 'mutation')
    return fail('Q010', `Q010: \`${id}\` uses the realtime transport`, 405)
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
      return out({ v: e.v, t: e.tags })
    }
    if (request.method !== 'POST')
      return fail('Q010', `Q010: mutation \`${id}\` needs POST`, 405, 'POST')
    const type = request.headers.get('content-type') ?? ''
    const multipart = type.startsWith('multipart/form-data') // `<Form>` with a file; `x-kerf` still forces a preflight
    if (
      crossOrigin(options, request, url) ||
      request.headers.get('x-kerf') !== '1' ||
      !(multipart || type.startsWith('application/json'))
    )
      return fail(
        'Q010',
        `Q010: mutation \`${id}\` without the CSRF proof (POST + JSON + \`x-kerf: 1\`, same origin): call it through its stub`,
        403,
      )
    const read = await limited(request, bodyLimit(options.site?.limits, request))
    let body: { i?: unknown; f?: [string, unknown][]; c?: 1 }
    try {
      body = multipart ? await multipartBody(read) : await read.json()
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return fail('Q002', 'Invalid server function body', 400)
    } catch {
      return fail('Q002', 'Invalid server function body', 400)
    }
    fromForm = !!body.c
    // A token opens only the functions listed for it, and what a mutation refreshes would run as that token too.
    const refresh =
      Array.isArray(body.f) && !request.headers.has('authorization') ? body.f.slice(0, 200) : []
    const answer = await exec.runMutation(scope, f, body.i, refresh, fromForm)
    if (options.dev && sessionChanged(scope.headers))
      options.onDiagnostic?.({
        code: 'A004',
        severity: 'warning',
        message: `\`${id}\` changed the session cookie without a redirect: the tab keeps what the last session cached. \`redirect()\` after it`,
      })
    return out(answer)
  } catch (error) {
    if (isRedirect(error))
      return out({ r: error.href, ...(sessionChanged(scope.headers) && { x: 1 }) })
    const e = await functionFault(error, scope, f, fromForm)
    return out({ e }, e.status, 'reference' in e ? e.reference : undefined)
  }
}

function functionResponses(scope: Scope, dev: boolean | undefined) {
  const out = (body: unknown, status = 200, reference?: string) => {
    const res = withHeaders(Response.json(body, { status }), scope)
    res.headers.set('cache-control', 'no-store') // a function's answer is never stored, whatever it set
    if (reference) res.headers.set(ERROR_HEADER, reference)
    return res
  }
  const fail = (code: string, message: string, status: number, allow?: string) => {
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

function crossOrigin(options: HandlerOptions, request: Request, url: URL) {
  const origin = request.headers.get('origin')
  const from = request.headers.get('sec-fetch-site')
  // Naming an origin permits its mutation; CORS separately decides whether the browser can read it.
  const named = options.site?.mutationOrigins
  const trusted = !!origin && !!named && (named === '*' || named.includes(origin))
  return (
    !trusted &&
    ((origin && origin !== url.origin) || (from && from !== 'same-origin' && from !== 'none'))
  )
}
