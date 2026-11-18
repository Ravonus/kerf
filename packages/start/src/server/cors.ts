import type { Site } from '@kerf-js/core/ssr'
import { ERROR_HEADER } from '../failure'

/** CORS for Kerf's function and navigation protocol. App HTTP routes set their own policy in the request hook. */
export function makeCors(site?: Site) {
  const config = site?.cors
  if (config?.origins === '*' && config.credentials)
    throw new TypeError('site.cors: wildcard origins cannot be combined with credentials')
  const headers = [
    'content-type',
    'x-kerf',
    'accept',
    ...(config?.headers ?? []).map((h) => h.toLowerCase()),
  ]
  return async (request: Request, next: () => Promise<Response>): Promise<Response> => {
    const url = new URL(request.url)
    const fn = url.pathname.startsWith('/_kerf/fn/')
    const data = url.pathname === '/_kerf/data' || url.pathname.startsWith('/_kerf/data/')
    if (!fn && !data) return next()
    const origin = request.headers.get('origin')
    const preflight =
      request.method === 'OPTIONS' && request.headers.has('access-control-request-method')
    const allowed =
      !!origin &&
      (origin === url.origin || config?.origins === '*' || config?.origins.includes(origin))
    const methods = fn ? ['GET', 'HEAD', 'POST'] : ['GET', 'HEAD']
    let response: Response
    if (preflight) {
      const method = request.headers.get('access-control-request-method') ?? ''
      const requested = (request.headers.get('access-control-request-headers') ?? '')
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
      const ok = allowed && methods.includes(method) && requested.every((h) => headers.includes(h))
      response = new Response(null, { status: ok ? 204 : 403 })
      if (ok) {
        response.headers.set('access-control-allow-methods', methods.join(', '))
        response.headers.set('access-control-allow-headers', headers.join(', '))
      }
    } else response = await next()
    // A fixed-header Response (for example a redirect) is still a stream; copying never reads its body.
    const out = new Response(response.body, response)
    if (config?.origins !== '*') out.headers.append('vary', 'Origin')
    if (preflight)
      out.headers.append('vary', 'Access-Control-Request-Method, Access-Control-Request-Headers')
    if (allowed && (!preflight || response.status === 204)) {
      out.headers.set('access-control-allow-origin', config?.origins === '*' ? '*' : origin)
      if (config?.credentials) out.headers.set('access-control-allow-credentials', 'true')
      if (!preflight)
        out.headers.append('access-control-expose-headers', `${ERROR_HEADER}, x-request-id`)
    }
    return out
  }
}
