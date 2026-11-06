import { createHash } from 'node:crypto'
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
  build?: string,
) {
  /** The route as JSON for client navigation, with deferred fields awaited. */
  return async function data(path: string, request: Request, scope: Scope): Promise<Response> {
    const r = await resolve(path, request)
    if (r.redirect)
      return noRetention(
        withHeaders(
          Response.json(
            { m: [], p: path, s: r.redirect.status, r: r.redirect.href } satisfies RoutePayload,
            { headers: { 'cache-control': 'no-store' } },
          ),
          scope,
        ),
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
    const body = JSON.stringify({ ...payload, ...(c.length && { c }) })
    const response = withHeaders(
      new Response(body, { headers: { 'content-type': 'application/json' } }),
      scope,
    )
    return validateNavigation(response, request, body, build, r.error ? 500 : r.status)
  }
}

function noRetention(response: Response): Response {
  response.headers.set('cache-control', 'no-store')
  response.headers.delete('etag')
  return response
}

function cacheDirectives(policy: string): string[] | undefined {
  const parts: string[] = []
  let start = 0
  let quoted = false
  let escaped = false
  for (let i = 0; i < policy.length; i++) {
    const char = policy[i]
    if (escaped) escaped = false
    else if (quoted && char === '\\') escaped = true
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) {
      parts.push(policy.slice(start, i).trim())
      start = i + 1
    }
  }
  if (quoted || escaped) return undefined
  parts.push(policy.slice(start).trim())
  return parts.filter(Boolean)
}

/** Validate only the final, authorized route representation. */
export function validateNavigation(
  response: Response,
  request: Request,
  body: string,
  build: string | undefined,
  status: number,
): Response {
  const headers = response.headers
  const policy = headers.get('cache-control') ?? ''
  const directives = cacheDirectives(policy)
  if (!directives) return noRetention(response)
  const noStore = directives.some((part) => /^no-store(?:\s*=|$)/i.test(part))
  if (status < 200 || status >= 300 || headers.has('set-cookie') || noStore) {
    if (noStore) {
      headers.delete('etag')
      return response
    }
    return noRetention(response)
  }

  const kept = directives.filter((part) => !/^(public|max-age)(?:\s*=|$)/i.test(part))
  // A bare private directive protects the entire response, including unlisted fields.
  const barePrivate = kept.some((part) => /^private$/i.test(part))
  if (!barePrivate) kept.unshift('private')
  kept.splice(1, 0, 'max-age=0')
  if (!policy) kept.push('stale-while-revalidate=30')
  headers.set('cache-control', kept.join(', '))
  const vary = headers.get('vary')
  if (vary !== '*') {
    const names = (vary ?? '').split(',').map((name) => name.trim()).filter(Boolean)
    for (const name of ['Accept', 'Cookie', 'Authorization'])
      if (!names.some((existing) => existing.toLowerCase() === name.toLowerCase())) names.push(name)
    headers.set('vary', names.join(', '))
  }
  const tag = `"${createHash('sha256').update(JSON.stringify([build ?? '', body])).digest('hex')}"`
  headers.set('etag', tag)
  const candidates = (request.headers.get('if-none-match') ?? '').split(',')
  if (candidates.some((candidate) => candidate.trim().replace(/^W\//, '') === tag ||
      candidate.trim() === '*')) return new Response(null, { status: 304, headers })
  return response
}
