import { renderToStringAsync } from '@kerf-js/core/ssr'
import type { Merged } from '@kerf-js/core/ssr'
import type { RoutePayload, createRouteState } from '../router'
import type { Scope } from '../exec'
import * as exec from '../exec'
import { App } from '../view'
import { withLevels } from './render'
import { payloadOf, wire } from './payload'
import { noRetention, validateNavigation } from './navigation-cache'
import { cookieJar, redirectBody, withHeaders } from './request'
import type { HandlerOptions, Resolved } from './types'
import { recoverRender, reportFailure, showRenderFailures } from './failure'
export function makeNavigation({
  resolve,
  finished,
  statics,
  stateOf,
  PASSES,
  options,
}: {
  resolve: (path: string, request: Request) => Promise<Resolved>
  finished: (r: Resolved, request: Request) => Promise<Merged>
  statics: Set<string>
  stateOf: (r: Resolved, payload: RoutePayload) => ReturnType<typeof createRouteState>
  PASSES: number
  options: HandlerOptions
}) {
  /** The route as JSON for client navigation, with deferred fields awaited. */
  return async function data(path: string, request: Request, scope: Scope): Promise<Response> {
    // Loads see the page's own URL, as on a full load, not `/_kerf/data/<path>`: method, headers and signal carry over.
    const r = await resolve(path, new Request(new URL(path, request.url), request))
    if (r.redirect) {
      const headers = new Headers(r.redirectHeaders)
      headers.delete('location')
      headers.set('cache-control', 'no-store')
      return noRetention(
        redirectBody(
          Response.json(
            { m: [], p: path, s: r.redirect.status, r: r.redirect.href } satisfies RoutePayload,
            { headers },
          ),
          scope,
          'application/json',
        ),
      )
    }
    showRenderFailures(scope, options, path)
    const payload = await recoverRender(r, scope, options, async () => {
      await settleLevels(r, scope, options)
      await finished(r, request)
      return navigationPayload(r, request, scope)
    })
    const c = wire(scope)
    const body = JSON.stringify({ ...payload, ...(c.length && { c }) })
    const response = withHeaders(
      new Response(body, {
        headers: { 'content-type': 'application/json' },
      }),
      scope,
    )
    const faulty = r.error || r.levels.some((lv) => lv.e)
    return validateNavigation(response, request, body, options.build, faulty ? 500 : r.status)
  }

  async function navigationPayload(r: Resolved, request: Request, scope: Scope) {
    let payload = payloadOf(r, true, options)
    if (r.levels.some((lv) => statics.has(lv.id))) {
      const route = stateOf(r, payload)
      const out = await renderToStringAsync(() => <App route={route} />, {
        passes: PASSES,
        shown: (error) => exec.shown(error, scope),
        routeErrors: true,
        app: { cookies: cookieJar(request) },
      })
      const at = out.lastIndexOf('<script type="application/json" data-kerf>')
      payload = {
        ...withLevels(payload, at < 0 ? out : out.slice(0, at), statics, true),
        ...(at >= 0 && {
          b: JSON.parse(
            out
              .slice(at)
              .replace(/^<[^>]*>/, '')
              .replace(/<\/script>$/, ''),
          ),
        }),
      }
    }
    return payload
  }
}

async function settleLevels(r: Resolved, scope: Scope, options: HandlerOptions) {
  for (const lv of r.levels) {
    if (!lv.d?.length) continue
    const fields = { ...(lv.data as object) } as Record<string, unknown>
    await Promise.all(
      lv.d.map(async (key) => {
        try {
          fields[key] = await (lv.raw as Record<string, unknown>)[key]
        } catch (error) {
          const data = reportFailure(scope, options, error, 500, 'E_LOAD', lv.id)
          ;(lv.e ??= {})[key] = data
        }
      }),
    )
    lv.data = fields
  }
}
