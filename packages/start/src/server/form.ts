import {
  decodeForm,
  fieldsOf,
  fns,
  isRedirect,
  StartError,
  FnError,
  type SchemaIssue,
} from '../data'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { bodyLimit, echoed, limited, withHeaders } from './request'
import type { HandlerOptions } from './types'
export function makeForm(
  options: HandlerOptions,
  page: (url: URL, request: Request, scope: Scope) => Promise<Response>,
) {
  /**
   * A form POST to a page (research 29 §5): the mutation, then 303 (Post/Redirect/Get) or the page again with the
   * errors and what was typed. A form can't send `x-kerf`, so the CSRF proof is the browser's own origin headers.
   */
  return async function form(url: URL, request: Request, scope: Scope): Promise<Response> {
    const origin = request.headers.get('origin')
    const from = request.headers.get('sec-fetch-site')
    if (
      !(origin
        ? origin === url.origin && (!from || from === 'same-origin')
        : from === 'same-origin')
    ) {
      options.onDiagnostic?.({
        code: 'F002',
        severity: 'error',
        message: `F002: a form POST to ${url.pathname} without the same-origin proof (\`Origin\` or \`Sec-Fetch-Site\`)`,
      })
      return new Response('Forbidden', { status: 403 })
    }
    let fields: FormData
    try {
      fields = await (await limited(request, bodyLimit(options.site?.limits, request))).formData()
    } catch (e) {
      if (!(e instanceof StartError)) throw e
      options.onDiagnostic?.({ code: e.code, severity: 'error', message: e.message })
      return new Response('Payload too large', { status: 413 })
    }
    const named = fields.get('$fn')
    const id = typeof named === 'string' ? named : ''
    const f = fns.get(id)
    if (f?.kind !== 'mutation') {
      options.onDiagnostic?.({
        code: 'F003',
        severity: 'error',
        message: `F003: a form POST names \`${id}\`, which is no mutation (the page is older than the server)`,
      })
      return new Response('Not found', { status: 404 })
    }
    const see = (href: string) =>
      withHeaders(
        new Response(null, {
          status: 303,
          headers: { location: href, 'cache-control': 'no-cache' },
        }),
        scope,
      )
    const input = decodeForm(fields)
    try {
      await exec.runMutation(scope, f, input, [], true)
      return see(url.pathname + url.search)
    } catch (e) {
      if (isRedirect(e)) return see(e.href)
      const known = e instanceof StartError || e instanceof FnError
      if (!known)
        options.onDiagnostic?.({
          code: 'E_FN',
          severity: 'error',
          message: `${id}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
        })
      const failure = e as { issues?: SchemaIssue[]; status?: number; message?: string } | null
      const issues = failure?.issues
      const { errors, message } = fieldsOf(issues)
      const key = fields.get('$form')
      scope.form = {
        id,
        ...(typeof key === 'string' && { key }),
        values: echoed(input),
        errors,
        message: issues ? message : (exec.shown(e, scope) as Error).message,
        status: issues ? 422 : (failure?.status ?? 500),
      }
      return page(url, request, scope)
    }
  }
}
