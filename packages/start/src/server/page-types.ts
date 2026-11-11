import type { Merged, Stream } from '@kerf-js/core/ssr'
import type { createRouteState, RoutePayload } from '../router'
import type { Scope } from '../exec'
import type { HandlerOptions, Resolved } from './types'

/** A render this long (ms) sends its head first. */
export const EARLY_MS = 4
/** Boundary data that arrives within this hold goes in the page. */
export const HOLD = 25

/** A remembered head for a route shape. */
export interface Head {
  ms: number
  sheets: { href: string }[]
  preloads: string
  now: boolean
  capture: boolean
  fold: boolean
  split: boolean
  found: Set<string>
}

export interface PageDeps {
  options: HandlerOptions
  site: NonNullable<HandlerOptions['site']>
  statics: Set<string>
  timing: { timeout?: number }
  passes: number
  resolve: (path: string, request: Request) => Promise<Resolved>
  stateOf: (r: Resolved, payload: RoutePayload) => ReturnType<typeof createRouteState>
  complete: (r: Resolved, html?: string) => Merged
  heads: Map<string, Head | null>
  remember: (shape: string, head: Head) => void
}

export interface PageState extends PageDeps {
  url: URL
  request: Request
  scope: Scope
  path: string
  r: Resolved
  route: ReturnType<typeof createRouteState>
  sent: Set<string>
  told: { r: Record<string, unknown>; b: Record<string, unknown>; s?: string }
  stream: Stream
  assets: NonNullable<HandlerOptions['assets']>
  lang: string
  dev: string
  status: number
  enc: TextEncoder
}
