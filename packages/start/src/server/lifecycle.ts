import * as exec from '../exec'
import type { Scope } from '../exec'
import { hub } from '../hub'
import { startCron } from './cron'
import type { makeServices } from './services'
import { onShutdown } from './shutdown'
import type { HandlerOptions } from './types'

/** The options with an `onDiagnostic` that names the request each diagnostic came from. */
export function withRequestIds(
  options: HandlerOptions,
  current: () => string | undefined,
): HandlerOptions {
  const report = options.onDiagnostic
  if (!report) return options
  return { ...options, onDiagnostic: (d) => report({ ...d, requestId: d.requestId ?? current() }) }
}

/**
 * What a serving process starts besides answering requests: the cron schedule, and on shutdown, stopping it and
 * closing realtime connections. A build, and `weft routes --meta`, load the server to read it, not to run it.
 */
export function lifecycle(
  options: HandlerOptions,
  services: ReturnType<typeof makeServices>,
  enter: (scope: Scope, run: () => Promise<void>) => Promise<void>,
) {
  if (process.env.WEFT_BUILD || options.requestOrigin === false) return
  const stopCron =
    options.cron &&
    startCron(options.cron, {
      scopeOptions: services.scopeOptions,
      store: options.store ?? exec.defaultStore,
      boot: async () => {
        await services.loadExtensions()
        await services.boot()
      },
      origin: (options.site?.url ?? 'http://localhost').replace(/\/$/, ''),
      enter,
    })
  if (!options.dev) onShutdown(() => (stopCron?.(), hub().shutdown()))
}
