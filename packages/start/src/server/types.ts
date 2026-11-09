import type { Site, Merged, Meta as MetaObject } from '@weft-js/core/ssr'
import type { AssetReceipt, Component, Match } from '../router'
import type { AuthProvider } from '../auth'
import type { ExtensionEntry } from '../extension'
import type { Context, Redirect } from '../data'
import type { MediaServer, Store } from '../exec'
import type { RealtimeOptions } from '../hub'
import type { Pieces } from '../first-paint'

/** A page route from the file tree. */
export interface RouteEntry {
  id: string
  file: string
  layouts: string[]
  pattern: string
  params: string[]
  splat?: string
  card?: string
  kind: 'page' | '404' | 'error'
}
/** A layout from the file tree. */
export interface LayoutEntry {
  id: string
  file: string
  dir: string
  parent?: string
}
/** The routes and layouts `weft build` found. */
export interface Manifest {
  dir: string
  routes: RouteEntry[]
  layouts: LayoutEntry[]
  defaultCard?: string
}

/** What a route file exports. */
export interface RouteModule {
  default?: Component
  load?: (args: {
    params: Record<string, string>
    request: Request
    signal: AbortSignal
    ctx: Context
  }) => unknown
  meta?:
    | MetaObject
    | ((args: {
        params: Record<string, string>
        data: unknown
      }) => MetaObject | Promise<MetaObject>)
  prerender?:
    | true
    | Record<string, string>[]
    | (() => Record<string, string>[] | Promise<Record<string, string>[]>)
  size?: { width: number; height: number }
}

/** A font for generated cards. */
export interface Font {
  name: string
  data: Uint8Array
  weight?: number
  style?: 'normal' | 'italic'
}

/** `createHandler`: the app as the build describes it, and how to serve it. */
export interface HandlerOptions {
  manifest: Manifest
  /** Route, layout and card modules by manifest file. */
  modules: Record<string, RouteModule>
  site?: Site
  /**
   * The client entry and what to preload (Nitro's `?assets=client`), plus the font build's preloads (`weft:fonts/preloads`).
   * `pieces`: the build's first-paint table. Without it, `inline` and Weft's purge (`critical`) are what `pageStyles` uses.
   */
  assets?: {
    entry?: string
    js?: { href: string }[]
    css?: { href: string }[]
    fonts?: { href: string; type: string }[]
    pieces?: Pieces & {
      shared?: { href: string; has: string[] }
      routes: { href: string; has: string[] }[]
    }
    inline?: Record<string, string>
    critical?: {
      parse: (css: string) => unknown[]
      purge: (sheets: string[], found: { has: (word: string) => boolean }) => string[]
    }
  }
  /** Changes with every build: part of each card's `?v=` hash. */
  build?: string
  /** Build-matched emitted asset receipt; null until the client bundle is available. */
  routeAssetBytes?: AssetReceipt | null
  dev?: boolean
  fonts?: Font[]
  /** Route and layout ids with no client code (PLAN §11): the server sends their HTML. */
  statics?: string[]
  /** Client chunks by level or island id: the page's own are preloaded, so they don't wait for the entry to ask. */
  chunks?: Record<string, { js?: { href: string }[]; css?: { href: string }[] }>
  /** Some island can wait, so every page carries the capture script: a navigation can arrive at one that does. */
  lazy?: boolean
  /** Stream timeout for Boundaries (ms). */
  timeout?: number
  /** How long (ms) a page waits for its Boundaries' data before streaming it: what lands sooner goes in the page. 0 streams at once. */
  hold?: number
  /** The app's context for `load` and server functions (`src/context.server.ts`'s default export). */
  context?: (args: { request: Request }) => object | Promise<object>
  /** The shared cache for `cache: { life }` queries (memory by default). */
  store?: Store
  /** `src/auth.server.ts`'s default export, any provider: mounted at its base path, checked on the first request. */
  auth?: Pick<AuthProvider, 'handler' | 'basePath' | '$weft'>
  /** `server.extension` providers with an app file (`virtual:weft/extensions`), loaded on the first request. */
  extensions?: ExtensionEntry[]
  /** The app's migrations (`drizzle/`); dev reads them each request, so `weft db generate` needs no restart. */
  migrations?: () => { tag: string; sql: string }[]
  /** The `media.server` provider (`virtual:weft/media`), loaded on first use. */
  media?: () => Promise<MediaServer>
  /** `src/realtime.server.ts`'s default export: the bus, origins and limits. */
  realtime?: RealtimeOptions
  /** `false`: never build URLs on the request's origin (`weft routes --meta`, whose requests aren't real). */
  requestOrigin?: false
  /** Queries marked `live: { required: true }` (`scanRequired`, at build). */
  liveRequired?: string[]
  /** Dev and tests: diagnostics found while serving (H005–H008, Q002–Q010). */
  onDiagnostic?: (d: { code: string; severity: string; message: string; route?: string }) => void
}

/** One matched route level, with its module and the data before serialising. */
export interface Level extends Match {
  mod?: RouteModule | undefined
  raw: unknown
}

/** Where the words on a page came from, and its image: what `weft routes --meta` and `weft check` report. */
export interface MetaSource {
  title: 'route' | 'layout' | 'auto' | 'config' | 'none'
  description: 'route' | 'layout' | 'auto' | 'config' | 'none'
  image: 'explicit' | 'card' | 'auto' | 'none'
}

/** What a path comes to: the status, the route and its levels. */
export interface Resolved {
  status: number
  path: string
  levels: Level[]
  head: Merged
  /** The page route, when one matched. */
  route?: RouteEntry | undefined
  error?: unknown
  /** A loader called `redirect()`: nothing renders. */
  redirect?: Redirect
  /** Headers supplied by a router-core redirect. */
  redirectHeaders?: Headers
  /** The metas the head is merged from, until `complete` has finished it. */
  metas?: MetaObject[] | undefined
  source?: MetaSource
  /** The origin URLs are built on, when one is known. */
  origin?: string | undefined
}
