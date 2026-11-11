// The route state both sides render from (research 25 §3). A page is a chain of levels, outer to inner: the root
// layout, nested layouts, the page. Each level is three boxes: which route it shows, its params and its loader
// data. Navigating writes only what changed: a level that keeps its route keeps its component and gets new params
// or data in place (the bindings that read them re-run, nothing remounts); the first level whose route changes
// renders its new route, and everything inside it goes. One state per request on the server (passed down as a
// prop), one per tab on the client.

import { state, untrack, type State, type SsrData } from '@kerf/core'
import type { Merged } from '@kerf/core/ssr'
import type { Wire } from './data'
import type { PreparedRouteShape } from './run/shape-preparation'

/**
 * One level as the server sends it: `d` lists the data's deferred fields (promises on the server, research 25 §4),
 * `t` the tags of the queries its `load` read (a mutation that invalidates one refreshes the route, research 27 §4).
 */
export interface Match {
  id: string
  params: Record<string, string>
  data?: unknown
  d?: string[] | undefined
  t?: string[] | undefined
  /** A static level: no client code (PLAN §11). `h`: its HTML (a navigation), `x`: a hash of it, to skip an unchanged one. */
  s?: 1
  h?: string
  x?: string
}

export interface Level {
  id: State<string | undefined>
  params: State<Record<string, string>>
  data: State<unknown>
  /** A static level's HTML: empty for the page's own; undefined for a level with client code. */
  html: State<string | undefined>
  /** A temporary incoming shape for this outlet, while its route is pending. */
  shape: State<PreparedRouteShape[] | undefined>
  x?: string | undefined
}

/** A route, layout or island: its props are its own, so nothing here can call one without a cast. */
export type Component = (props: never) => unknown

/** Sizes are emitted, uncompressed bytes in Vite's recorded static closure. */
export interface RouteAssetCosts {
  build: string
  scope: 'vite-static-closure'
  levels: { id: string; bytes: number | null }[]
  routeBytes: number | null
  eagerBytes: number | null
  combinedBytes: number | null
}

export interface AssetReceipt {
  build: string | null
  version: 1
  scope: 'vite-static-closure'
  files: Record<string, { bytes: number | null; kind: string }>
  routes: Record<string, { files: string[]; bytes: number | null } | null>
  eager: { files: string[]; bytes: number | null } | null
}

export interface RouteState {
  levels: Level[]
  /** The current path (pathname + search). */
  path: State<string>
  status: State<number>
  /** Loaded route components by id. */
  comps: Record<string, Component>
  /** Cost of the current match, when the client and receipt are from the same build. */
  assetBytes?: RouteAssetCosts | null
  /** Prepare a route's provided shape CSS until the caller releases it. */
  prepareShape?: (id: string) => PreparedRouteShape | null
  /** Client: shows a static level's HTML, with the next level inside it. */
  mount?: (html: string, depth: number, next: () => unknown) => unknown
  /** Around a level's component, at the same point on both sides: the server's markers, the client's key scope. */
  around?: (depth: number, id: string, body: () => unknown) => unknown
}

/** What `/_kerf/data/<path>` answers and what the page carries in `#kerf-route`: the matches, the head, the status. */
export interface RoutePayload {
  m: Match[]
  p: string
  s: number
  h?: Merged
  /** A redirect (the client navigates there instead). */
  r?: string
  /** The queries the loaders resolved, for the client cache (navigation only; a page carries `#kerf-cache`). */
  c?: Wire[]
  /** The islands in the static levels that can't wait, whose code has to be there first. */
  i?: string[]
  /** A navigation's page data, for those islands. */
  b?: SsrData | null
  /** Emitted asset cost for these levels, when a matching build receipt exists. */
  a?: RouteAssetCosts
}

/** The route state of the render in progress: a server pass sets it as it starts (passes are synchronous). */
export const active: { route?: RouteState } = {}

export function createRouteState(
  payload: RoutePayload,
  comps: Record<string, Component>,
): RouteState {
  const r: RouteState = { levels: [], path: state(payload.p), status: state(payload.s), comps }
  payload.m.forEach((m, d) => {
    const lv = level(r, d)
    lv.id.value = m.id
    lv.params.value = m.params
    lv.data.value = m.data
    lv.html.value = m.s ? (m.h ?? '') : undefined
    lv.x = m.x
  })
  return r
}

/** Level `d`, made on first use (an empty level renders nothing). */
export function level(r: RouteState, d: number): Level {
  return (r.levels[d] ??= {
    id: state<string | undefined>(undefined),
    params: state({}),
    data: state<unknown>(undefined),
    html: state<string | undefined>(undefined),
    shape: state<PreparedRouteShape[] | undefined>(undefined),
  })
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * Show `matches`: levels that keep their route get their new params and data (only when they differ, so a shared
 * layout whose data didn't change sees no write at all); the first level whose route changes, and every level after
 * it, switch route.
 */
export function applyMatches(r: RouteState, matches: Match[], path: string, status: number) {
  untrack(() => {
    const depth = Math.max(matches.length, r.levels.length)
    let fresh = false
    for (let d = 0; d < depth; d++) {
      const m = matches[d]
      const lv = level(r, d)
      if (m) {
        if (!same(lv.params.value, m.params)) lv.params.value = m.params
        if (!same(lv.data.value, m.data)) lv.data.value = m.data
        if (!m.s) lv.html.value = undefined
        else if (fresh || lv.x !== m.x || lv.id.value !== m.id) {
          lv.html.value = m.h
          fresh = true // its markers for the levels below are gone with it, so those can't adopt the page
        }
        lv.x = m.x
      }
      if (lv.id.value !== m?.id) lv.id.value = m?.id
    }
    if (r.path.value !== path) r.path.value = path
    if (r.status.value !== status) r.status.value = status
  })
}

/**
 * The tab's route state and navigation, set by `start()` (client.tsx). Server renders never touch them. The query
 * cache (data.ts, loaded only by apps that use a query) hooks in here, so `start()` doesn't ship it: `seed` takes
 * the entries a navigation brought (`seeds` holds them until it loads), `invalidated` refreshes the route data.
 */
export const client: {
  route?: RouteState
  navigate?: (
    href: string,
    options?: NavigateOptions & { replace?: boolean | undefined },
  ) => Promise<void>
  /** `since`: what `now` said when the navigation left, so entries a write has passed don't land. */
  seed?: (list: Wire[], since?: number) => void
  seeds?: Wire[] | undefined
  now?: () => number
  invalidated?: (tags: string[]) => void
  /** Clear navigation state before a session-changing reload. */
  sessionChanged?: () => void
  /** Dev: server code changed, so whatever a query read may have too. */
  refreshed?: () => void
} = {}

/** `navigate()`: replace the history entry, and keep the scroll. */
export interface NavigateOptions {
  /** Replace the history entry instead of pushing one. */
  replace?: boolean | undefined
  /** Keep the scroll position (default: top, or the URL's #hash). */
  scroll?: false
}

/** This tab's line to the app's other tabs: a list of tags a write invalidated, or `0` when the session changed. */
export const peers =
  typeof document !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('kerf:tags')
    : undefined

/** Go to `href` without a page load (a full load before `start()` ran, or for another origin). */
export function navigate(href: string, options?: NavigateOptions): Promise<void> {
  if (client.navigate) return client.navigate(href, options)
  location.assign(href)
  return Promise.resolve()
}
