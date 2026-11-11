import * as exec from '../exec'
import type { Scope } from '../exec'
import { hub } from '../hub'
import { startCron } from './cron'
import { startJobs } from './jobs'
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
 * What a serving process starts besides answering requests: the cron schedule and the job queue, and on shutdown,
 * stopping both (letting running jobs finish) and closing realtime connections. A build, and `kerf routes --meta`, load the server to read it, not to run it.
 */
export function lifecycle(
  options: HandlerOptions,
  services: ReturnType<typeof makeServices>,
  enter: (scope: Scope, run: () => Promise<void>) => Promise<void>,
) {
  if (process.env.KERF_BUILD || options.requestOrigin === false) return
  const deps = {
    scopeOptions: services.scopeOptions,
    store: options.store ?? exec.defaultStore,
    boot: async () => {
      await services.loadExtensions()
      await services.boot()
    },
    origin: (options.site?.url ?? 'http://localhost').replace(/\/$/, ''),
    enter,
  }
  const stopCron = options.cron && startCron(options.cron, deps)
  const stopJobs = options.jobs && startJobs(options.jobs, deps)
  if (!options.dev)
    onShutdown(async () => {
      stopCron?.()
      // Realtime goes first: open pages move to another instance while the jobs running here finish.
      await Promise.all([hub().shutdown(), stopJobs?.()])
    })
}
