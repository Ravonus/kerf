// The client (`client.tsx` starts it) and its router (research 25 §3): hydrate the server's page, then navigate without page loads. A navigation
// fetches `/_weft/data/<path>` (the server matches, runs the loaders and merges the head, so loaders never ship to
// the client), loads the route chunks it needs (started in parallel from a guess against the route table), and
// writes the levels: a level that keeps its route keeps its component and gets new params/data in place.
// `setHead` writes the server's merged tags for the tab title and history; crawlers only read the server's HTML.
//
// Server functions (research 27): the query cache seeds itself from the page's `#weft-cache` as it loads, and gets
// each navigation's `c` through `client.seed`, so hydration fetches nothing (and an app without queries doesn't ship
// the cache). Redirects from loaders and server functions navigate (at most 5 in a row); a
// mutation that invalidates a tag the current route's loaders read refetches the route data in place.

import { client, type Component } from './router'
import { mount, prepare } from './run/boot'
import { listeners } from './run/listeners'
import { Navigation } from './run/navigation'
import { prepareRouteShape } from './run/shape-preparation'

type Hot = ImportMeta & {
  hot?: { on(event: string, on: (data: { queries: boolean }) => unknown): void }
}

/**
 * Synchronous shape metadata from separately compiled modules. CSS and emitted
 * asset bytes are null until known; consumers must not treat them as available
 * or free. cssText holds generated groups and resolved static entry and level
 * styles, including tokens. cssStatus remains partial.
 * Unavailable covers unproven overrides and unsupported route files.
 */
export type RouteShape =
  | { kind: 'disabled'; css: string[] | null; bytes: number | null }
  | {
      kind: 'unavailable'
      reason: 'unresolved-export' | 'unsupported-file' | 'missing-shape'
      css: null
      bytes: null
    }
  | {
      kind: 'generated' | 'override'
      component: Component
      css: string[] | null
      cssText: string[]
      cssStatus: 'partial'
      bytes: number | null
    }

/** Shape entries are keyed by level id, including layouts and error routes. */
export type RouteShapes = Record<string, RouteShape>

/** The client half of `virtual:weft/routes`: the page routes in match order, and a chunk loader per route id. */
export interface ClientRoutes {
  build?: string | null
  table: { id: string; pattern: string; layouts: string[] }[]
  load: Record<string, () => Promise<{ default?: Component }>>
  /** Eager shape metadata, keyed by route or layout id. */
  shapes?: RouteShapes
  /** Each island's code, by id: all a static level loads (PLAN §11). */
  islands?: Record<string, () => Promise<{ default: Component }>>
}

/** Hydrate the page in `#app` and take over its links. Resolves once hydrated. */
export async function start(routes: ClientRoutes, options: { container?: Element } = {}) {
  const prepared = prepare(routes, options)
  await Promise.all(prepared.loads)
  const page = mount(prepared)
  page.route.prepareShape = (id) => prepareRouteShape(routes, id, document)
  const navigation = new Navigation(routes, page)
  client.navigate = navigation.go
  listeners(navigation, () => (import.meta as Hot).hot)
  return page.route
}
