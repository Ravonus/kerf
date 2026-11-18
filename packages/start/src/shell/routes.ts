// Both ends match from their own build, so the peer cannot choose route modules or params.
import type { Site } from '@kerf-js/core/head'
import type { SiteConfig } from '@kerf-js/core/config'
import { isRouteUrl } from '../shell'
import type { ShellBootstrap } from './bootstrap'
import { fields } from './wire'

/** Start site configuration for a release-owned shell and redirect destinations. */
export type ShellSite = Site & Pick<SiteConfig, 'render' | 'routeRedirects'>

export interface ShellConfig {
  root?: string | undefined
  site: ShellSite
  bootstrap?: ShellBootstrap
}

export interface ShellRoute {
  id: string
  pattern: string
  layouts: readonly string[]
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

type RouteTable = { table: readonly ShellRoute[]; root?: string | undefined }
const key = /^[a-zA-Z][\w-]{0,63}$/
const segment = /^:([a-zA-Z][\w-]{0,63})$/

function encodeParam(value: unknown, rule: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > 256 ||
    !value ||
    value === '.' ||
    value === '..' ||
    /[/\\%\p{Cc}]/u.test(value) ||
    typeof rule !== 'string' ||
    !rule ||
    rule.length > 256
  )
    return
  try {
    if (!new RegExp(`^(?:${rule})$`, 'u').test(value)) return
    return encodeURIComponent(value)
  } catch {
    return undefined
  }
}

function expand(pattern: string, validators: Readonly<Record<string, string>>, params: unknown) {
  const parts = pattern.split('/')
  const names = parts.flatMap((part) => segment.exec(part)?.[1] ?? [])
  if (names.length > 16 || new Set(names).size !== names.length || !fields(validators, names))
    return
  if (names.length ? !fields(params, names) : params !== undefined) return
  for (const [i, part] of parts.entries()) {
    if (!part.startsWith(':')) continue
    const name = segment.exec(part)?.[1]
    if (!name) return
    const encoded = encodeParam((params as Record<string, unknown>)[name], validators[name])
    if (!encoded) return
    parts[i] = encoded
  }
  return parts.join('/')
}

export function localDestination(routes: RouteTable, value: unknown) {
  if (!isRouteUrl(value) || !value.startsWith('/')) return
  const url = new URL(value, 'https://kerf.invalid')
  if (url.hash || !matchShell(routes.table, routes.root, url.pathname).found) return
  return url.pathname + url.search
}

export function redirectPath(
  routes: RouteTable & { site: ShellSite },
  id: unknown,
  params: unknown,
  from?: URL,
): string | undefined {
  const map = routes.site.routeRedirects
  if (typeof id !== 'string' || !key.test(id) || !map || !Object.hasOwn(map, id)) return
  const destination = map[id]
  if (typeof destination === 'string')
    return params === undefined ? localDestination(routes, destination) : undefined
  if (!destination || typeof destination.path !== 'string' || /[?#]/.test(destination.path)) return
  const expanded = expand(destination.path, destination.params ?? {}, params)
  const path = localDestination(routes, expanded)
  if (!path || destination.returnTo === undefined) return path
  if (!key.test(destination.returnTo)) return
  if (!from) return path
  const previous = localDestination(routes, from.pathname + from.search)
  if (!previous) return path
  const url = new URL(path, from.origin)
  url.searchParams.set(destination.returnTo, previous)
  const result = url.pathname + url.search
  return isRouteUrl(result) ? result : path
}

let release: RouteTable | undefined

export function setReturnRoutes(routes: RouteTable) {
  release = routes
}

/** Read one return-to query parameter at the current address, checked against this release. */
export function routeReturnTo(parameter: string): string | undefined {
  if (!release || !key.test(parameter)) return
  const values = new URL(location.href).searchParams.getAll(parameter)
  return values.length === 1 ? localDestination(release, values[0]) : undefined
}
