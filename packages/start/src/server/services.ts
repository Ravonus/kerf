import { runtime } from '../data'
import * as exec from '../exec'
import type { MediaServer } from '../exec'
import { configure, hub } from '../hub'
import { StartError } from '../data'
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
  let checked = !options.dev
  const authBase = (options.auth?.basePath ?? '/api/auth').replace(/\/$/, '')
  const extensions = new Map<string, ServerExtension>()
  let loading: Promise<void> | undefined
  const loadExtensions = () =>
    (loading ??= (async () => {
      for (const e of options.extensions ?? []) extensions.set(e.key, await e.load())
      scopeOptions.extensions = [...extensions.values()]
    })())
  let applied = -1
  configure({
    ...options.realtime,
    build: options.build,
    dev: options.dev,
    store: options.store,
    required: options.liveRequired,
    onDiagnostic: options.onDiagnostic,
  })

  /**
   * Before the first request (and in dev, when `drizzle/` grows): the auth secret, and the list each database applies
   * before its first statement (db/core.ts), so a page with no queries doesn't need one. A client whose statements can't
   * be held is migrated here; if that fails the request goes on, and Q016 is what using the database then gives.
   */
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

  const check = () => {
    if (!checked) {
      checked = true
      exec.checkTags((d) => options.onDiagnostic?.(d))
    }
  }
  let starting: Promise<void> | undefined
  let started = false
  const start = (workers: () => void) =>
    (starting ??= (async () => {
      await loadExtensions()
      check()
      await boot()
      if (process.env.KERF_BUILD || options.requestOrigin === false) {
        started = true
        return
      }
      if (options.liveRequired?.length) {
        const live = hub()
        await live.probed
        if (live.refused) throw live.refused
        if (!options.realtime?.changes)
          throw new StartError('R015', 'Required live data has no configured feed.', undefined, {
            status: 503,
          })
      }
      if (isDraining()) return
      const cleanup = await options.startup?.()
      if (typeof cleanup === 'function') onShutdown('application cleanup', () => cleanup())
      if (isDraining()) return
      workers()
      started = true
    })())
  return {
    mediaServer,
    scopeOptions,
    authBase,
    extensions,
    loadExtensions,
    boot,
    check,
    start,
    started: () => started,
  }
}
