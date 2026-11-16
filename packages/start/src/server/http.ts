import type { Scope } from '../exec'
import type { HandlerOptions } from './types'

/** Responses whose bytes and representation headers belong to the app, including Range and SSE. */
export const rawResponses = new WeakSet<Response>()

function matcher(pattern: string, page = false) {
  const source = pattern
    .slice(1)
    .split('/')
    .filter(Boolean)
    .map((s) =>
      s === '$$' || (s === '$' && page)
        ? '(?:/(.*))?'
        : s === '$'
          ? '/(.+)'
          : s.startsWith('$')
            ? '/([^/]+)'
            : '/' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('')
  return new RegExp('^' + (source || '/') + '/?$')
}

function priority(a: string, b: string) {
  const rank = (p: string) =>
    p
      .slice(1)
      .split('/')
      .filter(Boolean)
      .map((s) => (s === '$' || s === '$$' ? 0 : s.startsWith('$') ? 1 : 2))
  const left = rank(a),
    right = rank(b)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (right[i] ?? 3) - (left[i] ?? 3)
    if (delta) return delta
  }
  return 0
}

/** Match the server-only HTTP table, with the same path precedence as pages. */
export function makeHttp(options: HandlerOptions) {
  const routes = (options.manifest.http ?? []).map((route) => ({
    route,
    match: matcher(route.pattern),
  }))
  const pages = options.manifest.routes
    .filter((p) => p.kind === 'page')
    .sort((a, b) => priority(a.pattern, b.pattern))
    .map((p) => ({ pattern: p.pattern, match: matcher(p.pattern, true) }))
  return async (request: Request, scope: Scope): Promise<Response | undefined> => {
    const pathname = new URL(request.url).pathname
    for (const { route, match } of routes) {
      const found = match.exec(pathname)
      if (!found) continue
      const page = pages.find((p) => p.match.test(pathname))
      if (page && priority(page.pattern, route.pattern) < 0) return undefined
      const sharedPage = !!page && priority(page.pattern, route.pattern) === 0
      // A non-GET HTTP module may share a page's path. Let the page answer its GET and HEAD.
      if (
        sharedPage &&
        (request.method === 'GET' || request.method === 'HEAD') &&
        !route.methods.includes(request.method)
      )
        return undefined
      const allow = [...route.methods]
      if (sharedPage && !allow.includes('GET')) allow.push('GET')
      if (allow.includes('GET') && !allow.includes('HEAD')) allow.push('HEAD')
      const method =
        request.method === 'HEAD' && !route.methods.includes('HEAD') ? 'GET' : request.method
      const handler = options.httpModules?.[route.file]?.[method]
      if (!handler)
        return new Response('Method not allowed', {
          status: 405,
          headers: { allow: allow.join(', ') },
        })
      let params: Record<string, string>
      try {
        params = Object.fromEntries(
          route.params.map((name, i) => [name, decodeURIComponent(found[i + 1] ?? '')]),
        )
      } catch {
        return new Response('Invalid path encoding', { status: 400 })
      }
      let response = await handler(request, { params, ctx: () => scope.ctx() })
      if (!(response instanceof Response))
        throw new TypeError(`${route.file}: ${method} must return a Response`)
      if (request.method === 'HEAD' && response.body) {
        void response.body.cancel().catch(() => {})
        response = new Response(null, response)
      }
      rawResponses.add(response)
      return response
    }
    return undefined
  }
}
