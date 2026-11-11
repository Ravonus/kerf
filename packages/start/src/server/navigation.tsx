import { renderToStringAsync } from '@weft-js/core/ssr'
import type { Merged } from '@weft-js/core/ssr'
import type { RoutePayload, createRouteState } from '../router'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { App } from '../view'
import { withLevels } from './render'
import { payloadOf, wire } from './payload'
import { noRetention, validateNavigation } from './navigation-cache'
import { cookieJar, redirectBody, withHeaders } from './request'
import type { HandlerOptions, Resolved } from './types'
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
    // Loads see the page's own URL, as on a full load, not `/_weft/data/<path>`: method, headers and signal carry over.
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
    for (const lv of r.levels)
      if (lv.d?.length)
        lv.data = {
          ...(lv.data as object),
          ...Object.fromEntries(
            await Promise.all(
              lv.d.map(async (k) => [k, await (lv.raw as Record<string, unknown>)[k]]),
            ),
          ),
        }
    await finished(r, request)
    const c = wire(scope)
    let payload = payloadOf(r, true, options)
    if (r.levels.some((lv) => statics.has(lv.id))) {
      const route = stateOf(r, payload)
      const out = await renderToStringAsync(() => <App route={route} />, {
        passes: PASSES,
        shown: (e) => exec.shown(e, scope),
        app: { cookies: cookieJar(request) },
      })
      const at = out.lastIndexOf('<script type="application/json" data-weft>')
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
    const body = JSON.stringify({ ...payload, ...(c.length && { c }) })
    const response = withHeaders(
      new Response(body, { headers: { 'content-type': 'application/json' } }),
      scope,
    )
    return validateNavigation(response, request, body, options.build, r.error ? 500 : r.status)
  }
}
