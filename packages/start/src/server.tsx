// The request handler (research 25 §3–§5): match the path and run the loaders on @tanstack/router-core, merge the
// metadata (research 20 §1: awaited before the first byte, plain data), then stream the page: the head with every
// tag and the shell first, each Boundary's content as it resolves, the page data last. The same resolve step answers
// client navigations (`/_weft/data/<path>`) and renders share cards (`/_weft/og/<path>.png`).
//
// Status codes are decided before the first byte: 404 when nothing matches or a loader returns `notFound()`, 500 when
// a loader or `meta` throws, 307 (or the given status) when a loader calls `redirect()`. 404 and 500 render inside
// the root layout when it loaded.
//
// A build's stylesheets go in the page, a round trip saved before the first paint. Each `<style>` keeps a disabled link
// beside it: a disabled link is never fetched, and it is how Vite's preload helper, on importing a route's chunk, sees
// the sheet is there and doesn't apply it twice.
//
// Server functions (research 27): each request gets a scope (AsyncLocalStorage), so `q.fetch()` in loaders and `q()`
// in the render share one request cache; `/_weft/fn/<id>` answers the client's calls; the page ends with the
// scope's resolved entries (`#weft-cache`) so the client cache starts seeded and hydration fetches nothing.
//
// Forms and media (research 29): a form POST to a page URL runs its mutation, then answers 303 or the page with the
// errors in it, so `<Form>` works without JS. `/_weft/m/<hash>/<width>.<fmt>` serves media through the `media.server`
// provider. The request's cookies reach `persist: 'cookie'` boxes, and the `rt.isolated` below makes a scope reached
// outside a render S002: this process serves many users, so it has no "the tab's app".

import { AsyncLocalStorage } from 'node:async_hooks'
import { rt } from '@weft-js/core/internal'
import { runtime } from './data'
import * as exec from './exec'
import type { Scope } from './exec'
import { hub } from './hub'
import { makeMedia } from './server/media'
import { makeForm } from './server/form'
import { makeNavigation } from './server/navigation'
import { makeCard } from './server/card'
import { makePrerender } from './server/prerender'
import { makePage } from './server/page'
import { makeCore } from './server/core'
import { makeServices } from './server/services'
import { makeDispatch } from './server/dispatch'
import { makeHandler } from './server/handler'
import { makeComplete } from './server/head'
import { makePreview } from './server/preview'
import { resolveRoute } from './server/resolver'
import type { HandlerOptions } from './server/types'
export { cardPath, hash } from './server/text'
export type {
  RouteEntry,
  LayoutEntry,
  Manifest,
  RouteModule,
  Font,
  HandlerOptions,
  Level,
  MetaSource,
  Resolved,
} from './server/types'

const als = new AsyncLocalStorage<Scope>()
runtime.scope = () => als.getStore()
runtime.enter = (scope, fn) => als.run(scope as Scope, fn)
runtime.exec = exec
rt.isolated = true
runtime.poke = (tags, origin) => hub().poke(tags, origin)

const CARD = { width: 1200, height: 630 }
/** Render passes a page may take. Only a backstop: a render stops when its passes stop reading anything new, and `timeout` ends a stream. */
const PASSES = 1024

/** The app as a `(Request) => Response`: pages, data, functions and cards. */
export function createHandler(options: HandlerOptions) {
  const { manifest, site, byId, mod, comps, statics, heads, remember, originOf, stateOf, tree } =
    makeCore(options, als)
  const services = makeServices(options)
  const { scopeOptions, mediaServer, authBase, extensions } = services

  const resolve = (path: string, request: Request) =>
    resolveRoute(
      { als, scopeOptions, tree, site, manifest, byId, mod, comps, options, originOf },
      path,
      request,
    )

  const timing = options.timeout === undefined ? {} : { timeout: options.timeout }
  const complete = makeComplete(options, manifest, site, mod, CARD)

  const { finished, inspect } = makePreview(
    als,
    scopeOptions,
    resolve,
    stateOf,
    timing,
    complete,
    PASSES,
  )

  const page = makePage({
    options,
    site,
    statics,
    timing,
    passes: PASSES,
    resolve,
    stateOf,
    complete,
    heads,
    remember,
  })

  const form = makeForm(options, page)

  const media = makeMedia(options, mediaServer)

  const data = makeNavigation(resolve, finished, statics, stateOf, PASSES)

  const og = makeCard(resolve, finished, mod, manifest, options, site, CARD)

  const prerenderList = makePrerender(manifest, mod, resolve, finished)

  const route = makeDispatch({
    options,
    authBase,
    extensions,
    form,
    media,
    og,
    data,
    prerenderList,
    page,
  })
  const handler = makeHandler(options, als, services, route)
  return Object.assign(handler, { resolve, inspect })
}

export { headTags } from '@weft-js/core/ssr'
