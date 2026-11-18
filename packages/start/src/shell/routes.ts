// Both ends match from their own build, so the peer cannot choose route modules or params.
import type { Site } from '@kerf-js/core/head'
import type { SiteConfig } from '@kerf-js/core/config'
import { isRouteUrl } from '../shell'

/** Start site configuration for a release-owned shell and redirect destinations. */
export type ShellSite = Site & Pick<SiteConfig, 'render' | 'routeRedirects'>

export interface ShellConfig {
  root?: string | undefined
  site: ShellSite
}

export interface ShellRoute {
  id: string
  pattern: string
  layouts: string[]
  splat?: string | undefined
}

export type ShellParams = Record<string, string>

export function matchShell(
  table: readonly ShellRoute[],
  root: string | undefined,
  pathname: string,
) {
  const missing = { ids: root ? [root] : [], params: {} as ShellParams, found: false }
  if (pathname.length > 8192) return missing
  let parts
  try {
    const path = pathname.replace(/^\/|\/+$/g, '')
    parts = path ? path.split('/').map(decodeURIComponent) : []
  } catch {
    return missing
  }
  if (parts.some((part) => /\p{Cc}/u.test(part))) return missing
  for (const route of table) {
    const segs = route.pattern.split('/').filter(Boolean)
    const splat = route.splat
    if (splat ? parts.length < segs.length - 1 : parts.length !== segs.length) continue
    const params = Object.create(null) as ShellParams
    const matches = segs.every((segment, i) => {
      const part = parts[i]
      if (segment === '$' && splat) params[splat] = parts.slice(i).join('/')
      else if (segment.startsWith('$') && part) params[segment.slice(1)] = part
      else return segment.toLowerCase() === part?.toLowerCase()
      return true
    })
    if (matches) return { ids: [...route.layouts, route.id], params, found: true }
  }
  return missing
}

export function redirectPath(site: ShellSite, id: unknown) {
  const map = site.routeRedirects
  if (typeof id !== 'string' || !map || !Object.hasOwn(map, id)) return
  const value = map[id]
  return typeof value === 'string' && value.startsWith('/') && isRouteUrl(value) ? value : undefined
}
