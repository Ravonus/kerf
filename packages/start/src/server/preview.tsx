import type { AsyncLocalStorage } from 'node:async_hooks'
import { renderToStream, type Merged } from '@kerf/core/ssr'
import type { createRouteState, RoutePayload } from '../router'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { App } from '../view'
import { leftToPage } from './head'
import { payloadOf } from './payload'
import { cookieJar } from './request'
import type { Resolved } from './types'

/** Finish page metadata and inspect a route in its request scope. */
export function makePreview({
  als,
  scopeOptions,
  resolve,
  stateOf,
  timing,
  complete,
  PASSES,
}: {
  als: AsyncLocalStorage<Scope>
  scopeOptions: Parameters<typeof exec.createScope>[1]
  resolve: (path: string, request: Request) => Promise<Resolved>
  stateOf: (r: Resolved, payload: RoutePayload) => ReturnType<typeof createRouteState>
  timing: { timeout?: number }
  complete: (r: Resolved, html?: string) => Merged
  PASSES: number
}) {
  /** What `page` shows a reader, without the streaming: the same pass, so a page, its navigation and its card agree. */
  async function shell(r: Resolved, request: Request) {
    const route = stateOf(r, payloadOf(r, false))
    const s = renderToStream(() => <App route={route} />, {
      ...timing,
      passes: PASSES,
      app: { cookies: cookieJar(request) },
    })
    await s.settle()
    return s.shell
  }

  /**
   * The finished head of a request that doesn't otherwise render: it renders only when a level left words to the page.
   * A render that fails here (a build with no database) leaves the words to the config; the page still shows its own.
   */
  const finished = async (r: Resolved, request: Request) => {
    if (
      !r.metas ||
      r.status !== 200 ||
      !(leftToPage(r.source!.title) || leftToPage(r.source!.description))
    )
      return complete(r)
    return complete(r, await shell(r, request).catch(() => undefined))
  }

  /** `kerf routes --meta`: one page's finished head, its HTML and where its words came from, in a request scope. */
  const inspect = (path: string, request: Request) =>
    als.run(exec.createScope(request, scopeOptions), async () => {
      const r = await resolve(path, request)
      if (r.redirect) return { ...r, html: '' }
      const html = await shell(r, request).catch(() => '')
      complete(r, html)
      return { ...r, html }
    })

  return { finished, inspect }
}
