import type { HandlerOptions } from './types'

/**
 * What every response gets unless it set its own (`site.security` changes or drops them). Nothing here can break a
 * page: no CSP (that needs the app's own sources), and popups keep their opener, so OAuth popups still work.
 */
export const SECURITY: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'cross-origin-opener-policy': 'same-origin-allow-popups',
}
const HSTS = 'max-age=31536000'

/** Whether the page was reached over https: the URL, a proxy's `X-Forwarded-Proto`, or an https `site.url`. */
function secure(request: Request, options: HandlerOptions) {
  return (
    request.url.startsWith('https:') ||
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https' ||
    !!options.site?.url?.startsWith('https:')
  )
}

/** The headers `secured` adds for this request: the defaults, HSTS on https outside dev, then `site.security`. */
export function securityHeaders(request: Request, options: HandlerOptions): [string, string][] {
  const own = options.site?.security
  if (own === false) return []
  const all: Record<string, string | false> = { ...SECURITY }
  if (!options.dev && secure(request, options)) all['strict-transport-security'] = HSTS
  for (const [name, value] of Object.entries(own ?? {})) all[name.toLowerCase()] = value
  return Object.entries(all).filter((e): e is [string, string] => e[1] !== false)
}

/** The response with the security headers it doesn't already carry. A response with fixed headers is copied. */
export function secured(response: Response, request: Request, options: HandlerOptions): Response {
  const add = securityHeaders(request, options).filter(([name]) => !response.headers.has(name))
  if (!add.length) return response
  try {
    for (const [name, value] of add) response.headers.set(name, value)
    return response
  } catch {
    const headers = new Headers(response.headers)
    for (const [name, value] of add) headers.set(name, value)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}
