import { renderToStringAsync } from '@weft-js/core/ssr'
import type { Merged } from '@weft-js/core/ssr'
import type { RoutePayload, createRouteState } from '../router'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { App } from '../view'
import { withLevels } from './render'
import { payloadOf, wire } from './payload'
import { cookieJar, withHeaders } from './request'
import type { Resolved } from './types'
export function makeNavigation(
  resolve: (path: string, request: Request) => Promise<Resolved>,
  finished: (r: Resolved, request: Request) => Promise<Merged>,
  statics: Set<string>,
  stateOf: (r: Resolved, payload: RoutePayload) => ReturnType<typeof createRouteState>,
  PASSES: number,
) {
  /** The route as JSON for client navigation: deferred fields awaited (no streaming on navigation yet). */
  return async function data(path: string, request: Request, scope: Scope): Promise<Response> {
    const r = await resolve(path, request)
    if (r.redirect)
      return withHeaders(
        Response.json(
          { m: [], p: path, s: r.redirect.status, r: r.redirect.href } satisfies RoutePayload,
          { headers: { 'cache-control': 'no-cache' } },
        ),
        scope,
      )
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
    let payload = payloadOf(r, true)
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
    return withHeaders(
      Response.json(
        { ...payload, ...(c.length && { c }) },
        { status: 200, headers: { 'cache-control': 'no-cache' } },
      ),
      scope,
    )
  }
}
