import { runtime, StartError } from '../data'
import * as exec from '../exec'
import type { MediaServer } from '../exec'
import { configure, type Hub } from '../hub'
import { isDraining, onShutdown } from './shutdown.mjs'
import type { ServerExtension } from '../extension'
import type { HandlerOptions } from './types'

/** Handler-local extensions, media provider, and boot state. */
export function makeServices(options: HandlerOptions) {
  let provider: Promise<MediaServer> | undefined
  const mediaServer = () => (provider ??= options.media?.())
  const scopeOptions = {
    context: options.context,
    store: options.store,
    dev: options.dev,
    onDiagnostic: options.onDiagnostic,
    media: mediaServer,
    extensions: undefined as ServerExtension[] | undefined,
  }
  const authBase = (options.auth?.basePath ?? '/api/auth').replace(/\/$/, '')
  const extensions = new Map<string, ServerExtension>()
  let loading: Promise<void> | undefined
  const loadExtensions = () =>
    (loading ??= (async () => {
      for (const e of options.extensions ?? []) extensions.set(e.key, await e.load())
      scopeOptions.extensions = [...extensions.values()]
    })())
  let applied = -1
  const realtime = configure({
    ...options.realtime,
    build: options.build,
    dev: options.dev,
    store: options.store,
    required: options.liveRequired,
    onDiagnostic: options.onDiagnostic,
  })

  // A migration failure stays local to database use, so unrelated pages can still answer.
  async function boot() {
    const list = options.migrations?.() ?? []
    if (applied !== list.length) {
      options.auth?.$kerf?.check()
      for (const e of extensions.values()) await e.check?.(options.dev)
      applied = list.length
      const report = (e: unknown) =>
        options.onDiagnostic?.({
          code: 'Q016',
          severity: 'error',
          message: `Q016: ${String((e as Error | null)?.message ?? e)}`,
        })
      runtime.migrations = { list, report }
    }
    if (runtime.dbs?.size)
      await Promise.all([...runtime.dbs].map((ready) => Promise.resolve(ready()).catch(() => {})))
  }

  let starting: Promise<void> | undefined
  let started = false
  let failed = false
  const start = (workers: () => void) =>
    (starting ??= (async () => {
      await loadExtensions()
      if (options.dev) exec.checkTags((d) => options.onDiagnostic?.(d))
      await boot()
      if (!process.env.KERF_BUILD && options.requestOrigin !== false)
        await startApp(options, realtime, workers)
      started = !isDraining()
    })().catch((error) => {
      failed = true
      throw error
    }))
  return {
    mediaServer,
    scopeOptions,
    authBase,
    extensions,
    boot,
    start,
    failed: () => failed,
    started: () => started,
  }
}

async function startApp(options: HandlerOptions, realtime: Hub, workers: () => void) {
  if (options.liveRequired?.length) {
    await realtime.probed
    if (realtime.refused) throw realtime.refused
    if (!options.realtime?.changes)
      throw new StartError('R015', 'Required live data has no configured feed.', undefined, {
        status: 503,
      })
  }
  if (isDraining()) return
  const cleanup = await options.startup?.()
  if (typeof cleanup === 'function') onShutdown('application cleanup', () => cleanup())
  if (!isDraining()) workers()
}
