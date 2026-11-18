import type { Scope } from '../exec'
import { admitValue, shellResponse, ShellDataError } from '../shell/operation'
import { SHELL_TIMEOUT } from '../shell/wire'
import { reportFailure } from './failure'
import type { HandlerOptions } from './types'

/** Read the public startup value through the same data-only boundary as operations. */
export async function serveBootstrap(options: HandlerOptions, request: Request, scope: Scope) {
  const build = options.build ?? null
  const send = (value: unknown, status = 200) => shellResponse(build, 'bootstrap', value, status)
  if (request.method !== 'GET') return send({ code: 'method' }, 405)
  const contract = options.bootstrap
  if (!contract) return send({ code: 'missing' }, 404)
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(SHELL_TIMEOUT)])
    const value = await contract.provide({ request, signal, ctx: await scope.ctx() })
    return send(await admitValue(contract.schema, value))
  } catch (error) {
    reportFailure(
      scope,
      options,
      error instanceof ShellDataError ? new Error(error.message) : error,
      {
        code: 'E_REQUEST',
        status: 500,
        route: '/_kerf/bootstrap',
      },
    )
    return send({ code: 'failed' }, 500)
  }
}
