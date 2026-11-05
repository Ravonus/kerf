import { sessionChanged } from '../auth'
import { fns, isRedirect, FnError, StartError } from '../data'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { multipartBody, withHeaders } from './request'
import type { HandlerOptions } from './types'

/** `/_weft/fn/<id>`: GET runs a query, POST a mutation (CSRF-checked), both answering JSON (research 27 §3). */
export async function serverFunction(
  options: HandlerOptions,
  url: URL,
  request: Request,
  scope: Scope,
): Promise<Response> {
  const id = decodeURIComponent(url.pathname.slice('/_weft/fn/'.length))
  const f = fns.get(id)
  const out = (body: unknown, status = 200) =>
    withHeaders(Response.json(body, { status, headers: { 'cache-control': 'no-store' } }), scope)
  const fail = (
    code: string,
    message: string,
    status: number,
    extra: object = {},
    sent?: unknown,
  ) => {
    options.onDiagnostic?.({ code, severity: 'error', message })
    return out(
      { e: { code, message: sent instanceof Error ? sent.message : message, ...extra } },
      status,
    )
  }
  if (!f)
    return fail(
      'Q009',
      `Q009: no server function \`${id}\` (the page is older than the server, or the module isn't a server module): reload`,
      404,
    )
  let fromForm = false
  if (f.kind === 'stream')
    return fail('Q009', `Q009: \`${id}\` is a stream: its client reads it over \`/_weft/rt\``, 405)
  try {
    if (f.kind === 'query') {
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return fail('Q009', `Q009: \`${id}\` is a query: GET only`, 405)
      const raw = url.searchParams.get('i')
      const e = await exec.fetchQuery(scope, f, raw === null ? undefined : JSON.parse(raw))
      return out({ v: e.v, t: e.tags })
    }
    if (request.method !== 'POST') return fail('Q010', `Q010: mutation \`${id}\` needs POST`, 405)
    const origin = request.headers.get('origin')
    const from = request.headers.get('sec-fetch-site')
    const cross =
      (origin && origin !== url.origin) || (from && from !== 'same-origin' && from !== 'none')
    const type = request.headers.get('content-type') ?? ''
    const multipart = type.startsWith('multipart/form-data') // `<Form>` with a file; `x-weft` still forces a preflight
    if (
      cross ||
      request.headers.get('x-weft') !== '1' ||
      !(multipart || type.startsWith('application/json'))
    )
      return fail(
        'Q010',
        `Q010: mutation \`${id}\` without the CSRF proof (POST + JSON + \`x-weft: 1\`, same origin): call it through its stub`,
        403,
      )
    const body = multipart
      ? await multipartBody(request)
      : ((await request.json()) as { i?: unknown; f?: [string, unknown][]; c?: 1 })
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
  } catch (e) {
    return functionError(e, fromForm, scope, options, id, out, fail)
  }
}

function functionError(
  e: unknown,
  fromForm: boolean,
  scope: Scope,
  options: HandlerOptions,
  id: string,
  out: (body: unknown, status?: number) => Response,
  fail: (code: string, message: string, status: number, extra?: object, sent?: unknown) => Response,
): Response {
  // The session changed: a full load, so nothing cached for the last user survives in the tab (research 28 §3).
  if (isRedirect(e)) return out({ r: e.href, ...(sessionChanged(scope.headers) && { x: 1 }) })
  if (e instanceof FnError) return out({ e: { code: e.code, message: e.message } }, e.status)
  // A wrong field in a form is an answer, not a fault: nothing to log.
  if (e instanceof StartError && fromForm && e.extra.issues)
    return out({ e: { code: e.code, message: e.message, issues: e.extra.issues } }, 422)
  if (e instanceof StartError)
    return fail(
      e.code,
      e.message,
      (e.extra.status as number) ?? 500,
      e.extra.issues ? { issues: e.extra.issues } : e.extra.typed ? { data: e.extra.data } : {},
      exec.shown(e, scope),
    )
  options.onDiagnostic?.({
    code: 'E_FN',
    severity: 'error',
    message: `${id}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
  })
  return out(
    {
      e: { message: options.dev && e instanceof Error ? e.message : 'Server function failed.' },
    },
    500,
  )
}
