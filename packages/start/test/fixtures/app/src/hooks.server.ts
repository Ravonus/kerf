import type { RequestHook } from '@kerf-js/start/server'

export const handle: RequestHook = async (request, next) => {
  if (new URL(request.url).pathname === '/hook-stop')
    return new Response('setup required', { status: 307, headers: { location: '/setup' } })
  const headers = new Headers(request.headers)
  headers.set('x-endpoint-hook', 'yes')
  const response = await next(new Request(request, { headers }))
  const out = new Response(response.body, response)
  out.headers.set('server-timing', 'hook;dur=1')
  return out
}
