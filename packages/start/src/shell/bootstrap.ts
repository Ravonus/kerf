// A release's runtime settings belong to one contract and are read before its route modules load.
import { createRoot, state } from '@kerf-js/core'
import type { Context } from '../data'
import type { RouteSchema } from '../shell'
import { requestShell } from './client-operations'
import { shellBuild } from './client-policy'
import { admitValue, readValue, ShellDataError, shellHeaders } from './operation'
import { SHELL_TIMEOUT } from './wire'

/** Release views for a bootstrap read before the first route. */
export interface BootstrapViews {
  pending?: () => unknown
  failure?: (props: { error: ShellDataError; retry: () => void }) => unknown
}

/** The value and on-demand refresh for a release-owned bootstrap schema. */
export interface ShellBootstrap<T = unknown> {
  readonly schema: RouteSchema<T>
  readonly views: BootstrapViews
  /** The admitted value. Throws when startup or refresh has failed. */
  read(): T
  /** Re-read through clientFetch. A failure clears the admitted value. */
  refresh(): Promise<T>
}

/** Implement the default export of `src/bootstrap.server.ts` with this type. */
export type BootstrapProvider<B extends ShellBootstrap> = (args: {
  request: Request
  signal: AbortSignal
  ctx: Context
}) => ReturnType<B['read']> | Promise<ReturnType<B['read']>>

/** Create and default-export a shell startup contract from `src/bootstrap.ts` or `.tsx`. */
export function defineBootstrap<T>(
  schema: RouteSchema<T>,
  views: BootstrapViews = {},
): ShellBootstrap<T> {
  const value = createRoot(() => state<{ data: T } | undefined>(undefined), null)
  let reading: Promise<T> | undefined
  return {
    schema,
    views,
    read() {
      if (!value.value) throw new ShellDataError('unavailable')
      return value.value.data
    },
    refresh() {
      return (reading ??= readBootstrap(schema)
        .then((data) => {
          value.value = { data }
          return data
        })
        .catch((error: unknown) => {
          value.value = undefined
          throw error
        })
        .finally(() => {
          reading = undefined
        }))
    },
  }
}

async function readBootstrap<T>(schema: RouteSchema<T>): Promise<T> {
  const build = shellBuild()
  const signal = AbortSignal.timeout(SHELL_TIMEOUT)
  try {
    const response = await requestShell('/_kerf/bootstrap', {
      method: 'GET',
      headers: shellHeaders,
      signal,
    })
    return (await admitValue(
      schema,
      await readValue(response, { build, kind: 'bootstrap', signal }),
      signal,
    )) as T
  } catch (error) {
    throw signal.aborted ? new ShellDataError('unavailable') : error
  }
}
