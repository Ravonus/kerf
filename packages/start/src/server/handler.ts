import type { AsyncLocalStorage } from 'node:async_hooks'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { hub } from '../hub'
import { compressed } from './compression'
import { stamped } from './request'
import type { makeServices } from './services'
import type { HandlerOptions } from './types'

/** Wrap endpoint routing in the request scope and boot lifecycle. */
export function makeHandler(
  options: HandlerOptions,
  als: AsyncLocalStorage<Scope>,
  services: ReturnType<typeof makeServices>,
  route: (request: Request, scope: Scope) => Promise<Response>,
) {
  return async (incoming: Request): Promise<Response> => {
    const request = options.auth ? stamped(incoming) : incoming
    await services.loadExtensions()
    services.check()
    const scope = exec.createScope(request, services.scopeOptions)
    // The build's prerender only lists cards: it holds no secrets and may have no database.
    if (new URL(request.url).pathname === '/_weft/og-routes')
      return als.run(scope, () => route(request, scope))
    await services.boot()
    if (options.liveRequired?.length) await hub().probed
    if (hub().refused)
      return Response.json(
        {
          e: {
            code: 'R015',
            message: options.dev ? hub().refused!.message : 'Live data is unavailable.',
          },
        },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      )
    return compressed(request, await als.run(scope, () => route(request, scope)))
  }
}
