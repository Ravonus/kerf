import type { AsyncLocalStorage } from 'node:async_hooks'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { hub } from '../hub'
import { compressed, whole } from './compression'
import { rawResponses } from './http'
import { stamped } from './request'
import { secured } from './security'
import { requestIdOf } from './log'
import { health } from './health'
import type { makeServices } from './services'
import type { HandlerOptions } from './types'
import { ERROR_HEADER } from '../failure'

/** Wrap endpoint routing in the request scope and boot lifecycle. */
export function makeHandler(
  options: HandlerOptions,
  als: AsyncLocalStorage<Scope>,
  services: ReturnType<typeof makeServices>,
  route: (request: Request, scope: Scope) => Promise<Response>,
) {
  return async (incoming: Request): Promise<Response> => {
    const request = stamped(incoming, options.site?.trustProxy)
    let routed: Response | undefined
    const next = async (replacement = request) => {
      const response = await handle(replacement)
      const text = options.handle ? whole.get(response) : undefined
      // A hook can read or transform the body. Complete pages otherwise defer allocating it until compression.
      if (text === undefined) return (routed = response)
      routed = new Response(text, response)
      whole.set(routed, text)
      return routed
    }
    const response = options.handle ? await options.handle(request, next) : await next()
    // Nitro's upgrade hooks travel beside the Response. A header-only wrapper must retain them; a refusal must not.
    if (
      routed &&
      response.body === routed.body &&
      response.status === routed.status &&
      Reflect.has(routed, 'crossws')
    )
      Object.assign(response, { crossws: Reflect.get(routed, 'crossws') })
    if (routed && response.body === routed.body) {
      if (rawResponses.has(routed)) rawResponses.add(response)
      const text = whole.get(routed)
      if (text !== undefined) whole.set(response, text)
    }
    // Hooks see the representation, never compressed bytes that a text transform would corrupt.
    const out = rawResponses.has(response) ? response : await compressed(request, response)
    return secured(out, request, options)
  }
  async function handle(request: Request): Promise<Response> {
    await services.loadExtensions()
    services.check()
    const scope = exec.createScope(request, services.scopeOptions)
    scope.requestId = requestIdOf(request, options.site)
    const { pathname } = new URL(request.url)
    if (pathname === '/_kerf/health') return health(options.dev)
    // The build's prerender only lists cards: it holds no secrets and may have no database.
    if (pathname === '/_kerf/og-routes') return als.run(scope, () => route(request, scope))
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
    let response: Response
    try {
      response = await als.run(scope, () => route(request, scope))
    } catch (e) {
      void exec.finishScope(scope)
      throw e
    }
    const finished = exec.finishing(response, scope)
    if (rawResponses.has(response)) rawResponses.add(finished)
    try {
      finished.headers.set('x-request-id', scope.requestId)
      if (scope.failure.reference) finished.headers.set(ERROR_HEADER, scope.failure.reference)
    } catch {} // a response with fixed headers goes without it
    return finished
  }
}
