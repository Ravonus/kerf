import { EXTENSION, type ServerExtension } from '../extension'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { rtRoute } from '../hub'
import { socketRoute } from '../socket'
import { serverFunction } from './functions'
import type { HandlerOptions } from './types'

interface Dispatch {
  options: HandlerOptions
  authBase: string
  extensions: Map<string, ServerExtension>
  form: (url: URL, request: Request, scope: Scope) => Promise<Response>
  media: (url: URL, request: Request) => Promise<Response>
  og: (url: URL, request: Request) => Promise<Response>
  data: (path: string, request: Request, scope: Scope) => Promise<Response>
  prerenderList: (request: Request, url: URL) => Promise<Response>
  page: (url: URL, request: Request, scope: Scope) => Promise<Response>
}

/** Select the endpoint for a request. */
export function makeDispatch({
  options,
  authBase,
  extensions,
  form,
  media,
  og,
  data,
  prerenderList,
  page,
}: Dispatch) {
  /** Everything under `/_weft/x/<key>/`, for the extension with that key. Nothing else reaches it. */
  async function extensionRoute(url: URL, request: Request, scope: Scope) {
    const [key = '', ...rest] = url.pathname.slice(EXTENSION.length).split('/')
    const extension = extensions.get(key)
    if (!extension?.handle) return new Response('Not found', { status: 404 })
    return extension.handle(request, rest.join('/'), {
      invalidate: (tags) => exec.invalidate(scope, tags),
      report: (d) => options.onDiagnostic?.(d),
    })
  }

  return (request: Request, scope: Scope): Promise<Response> => {
    const url = new URL(request.url)
    if (options.auth && (url.pathname === authBase || url.pathname.startsWith(authBase + '/')))
      return Promise.resolve(options.auth.handler(request))
    if (url.pathname.startsWith('/_weft/fn/')) return serverFunction(options, url, request, scope)
    if (url.pathname.startsWith(EXTENSION)) return extensionRoute(url, request, scope)
    if (
      request.method === 'POST' &&
      !url.pathname.startsWith('/_weft/') &&
      /^(application\/x-www-form-urlencoded|multipart\/form-data)/.test(
        request.headers.get('content-type') ?? '',
      )
    )
      return form(url, request, scope)
    if (url.pathname === '/_weft/rt') return rtRoute(request, scope, options.realtime?.origins)
    if (url.pathname === '/_weft/ws') return socketRoute(request, scope, options.realtime?.origins)
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return Promise.resolve(new Response('Method not allowed', { status: 405 }))
    if (url.pathname.startsWith('/_weft/m/')) return media(url, request)
    if (url.pathname.startsWith('/_weft/og/') && url.pathname.endsWith('.png'))
      return og(url, request)
    if (url.pathname.startsWith('/_weft/data/') || url.pathname === '/_weft/data')
      return data((url.pathname.slice('/_weft/data'.length) || '/') + url.search, request, scope)
    if (url.pathname === '/_weft/og-routes') return prerenderList(request, url)
    return page(url, request, scope)
  }
}
