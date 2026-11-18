import type { AsyncLocalStorage } from 'node:async_hooks'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { compressed, whole } from './compression'
import { rawResponses } from './http'
import { stamped } from './request'
import { secured } from './security'
import { requestIdOf } from './log'
import { probeResponse, readiness } from './health'
import { BOOT_REQUEST, isDraining } from './shutdown.mjs'
import type { makeServices } from './services'
import type { HandlerOptions } from './types'
import { ERROR_HEADER } from '../failure'
import { reportFailure } from './failure'
import { errorFrameStatus, peerStatus, shellResponse } from '../shell/operation'
import { makeCors } from './cors'

/** Wrap endpoint routing in the request scope and boot lifecycle. */
export function makeHandler(
  options: HandlerOptions,
  als: AsyncLocalStorage<Scope>,
  services: ReturnType<typeof makeServices>,
  route: (request: Request, scope: Scope) => Promise<Response>,
  workers: () => void,
) {
  const cors = makeCors(options.site)

  return async (incoming: Request): Promise<Response> => {
    if (Reflect.get(incoming, BOOT_REQUEST)) {
      await services.start(workers)
      return new Response(null, { status: 204 })
    }
    const request = stamped(incoming, options.site?.trustProxy)
    const id = requestIdOf(request, options.site)
    const initial = exec.createScope(request, services.scopeOptions)
    initial.requestId = id
    let scope = initial
    let routed: Response | undefined
    const next = async (replacement = request) => {
      if (replacement !== request) {
        scope = exec.createScope(replacement, services.scopeOptions)
        scope.requestId = id
      }
      const response = await als.run(scope, () => dispatch(replacement, scope))
      const text = options.handle ? whole.get(response) : undefined
      // A hook can read or transform the body. Complete pages otherwise defer allocating it until compression.
      if (text === undefined) return (routed = response)
      routed = new Response(text, response)
      whole.set(routed, text)
      return routed
    }
    return als.run(initial, async () => {
      const path = new URL(request.url).pathname
      let out: Response
      try {
        if (isDraining()) out = probeResponse({ ok: path === '/_kerf/health' })
        else out = await (options.handle ? options.handle(request, next) : next())
        inheritTransport(out, routed)
        if (!rawResponses.has(out)) out = await compressed(request, out)
      } catch (error) {
        out = await escaped(error, request, scope, { options, cors, startup: services.failed() })
      }
      return stampResponse(out, {
        request,
        id,
        options,
        reference: shellOperation(options, path)
          ? undefined
          : (out.headers.get(ERROR_HEADER) ?? scope.failure.reference),
      })
    })
  }

  async function dispatch(request: Request, scope: Scope): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/_kerf/health') return probeResponse({ ok: true })
    // The build's prerender only lists cards: it holds no secrets and may have no database.
    if (pathname === '/_kerf/og-routes') return route(request, scope)
    try {
      await services.start(workers)
      if (pathname === '/_kerf/ready')
        return readiness(options.dev, services.started() && !isDraining())
      await services.boot()
      if (isDraining()) return probeResponse({ ok: false })
      const response = await route(request, scope)
      const finished = exec.finishing(response, scope)
      if (rawResponses.has(response)) rawResponses.add(finished)
      inheritTransport(finished, response)
      return finished
    } catch (error) {
      void exec.finishScope(scope)
      throw error
    }
  }
}

function escaped(
  error: unknown,
  request: Request,
  scope: Scope,
  {
    options,
    cors,
    startup,
  }: { options: HandlerOptions; cors: ReturnType<typeof makeCors>; startup: boolean },
) {
  if (error instanceof Response) return error
  const operation = shellOperation(options, new URL(request.url).pathname)
  if (!operation && options.dev && !startup) throw error
  const data = reportFailure(scope, options, error, {
    status: startup ? 503 : 500,
    code: startup ? 'E_STARTUP' : 'E_REQUEST',
  })
  if (operation) {
    const code = peerStatus(data.status)
    return cors(request, () =>
      Promise.resolve(
        shellResponse(options.build ?? null, operation, { code }, errorFrameStatus(code)),
      ),
    )
  }
  return cors(request, () =>
    Promise.resolve(
      Response.json(
        { e: data },
        {
          status: data.status,
          headers: { 'cache-control': 'no-store', [ERROR_HEADER]: data.reference },
        },
      ),
    ),
  )
}

function shellOperation(options: HandlerOptions, pathname: string) {
  if (options.site?.render !== 'shell') return
  if (pathname === '/_kerf/bootstrap') return 'bootstrap'
  if (pathname === '/_kerf/rt' || pathname === '/_kerf/ws') return 'realtime'
  if (!pathname.startsWith('/_kerf/fn/')) return
  const id = pathname.slice('/_kerf/fn/'.length)
  try {
    return 'fn:' + decodeURIComponent(id)
  } catch {
    return 'fn:' + id
  }
}

function inheritTransport(response: Response, source?: Response) {
  if (!source || response === source || response.body !== source.body) return
  if (rawResponses.has(source)) rawResponses.add(response)
  const text = whole.get(source)
  if (text !== undefined) whole.set(response, text)
  if (response.status === source.status && Reflect.has(source, 'crossws'))
    Object.assign(response, { crossws: Reflect.get(source, 'crossws') })
}

function stampResponse(
  response: Response,
  {
    request,
    id,
    options,
    reference,
  }: {
    request: Request
    id: string
    options: HandlerOptions
    reference?: string | undefined
  },
) {
  const securedResponse = secured(response, request, options)
  inheritTransport(securedResponse, response)
  let out = securedResponse
  if (request.method === 'HEAD' && out.body) {
    void out.body.cancel().catch(() => {})
    out = new Response(null, out)
  }
  const set = (headers: Headers) => {
    headers.set('x-request-id', id)
    if (reference) headers.set(ERROR_HEADER, reference)
  }
  try {
    set(out.headers)
    return out
  } catch {
    const copy = new Response(out.body, out)
    set(copy.headers)
    inheritTransport(copy, out)
    return copy
  }
}
