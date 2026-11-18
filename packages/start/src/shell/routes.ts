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
  holes?: ReadonlySet<number>,
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
      else return !holes?.has(i) && segment.toLowerCase() === part?.toLowerCase()
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
    value !== value.normalize('NFC') ||
    value === '.' ||
    value === '..' ||
    /[/\\%?#\p{Cc}]/u.test(value) ||
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
  const holes = new Set<number>()
  for (const [i, part] of parts.entries()) {
    if (!part.startsWith(':')) continue
    const name = segment.exec(part)?.[1]
    if (!name) return
    const encoded = encodeParam((params as Record<string, unknown>)[name], validators[name])
    if (!encoded) return
    holes.add(i - 1)
    parts[i] = encoded
  }
  return { path: parts.join('/'), holes }
}

function localDestination(routes: RouteTable, value: unknown, holes?: ReadonlySet<number>) {
  if (!isRouteUrl(value) || !value.startsWith('/')) return
  const raw = value.split(/[?#]/, 1)[0]!
  if (raw.split('/').some((part) => /^\.{1,2}$/.test(part.replace(/%2e/gi, '.')))) return
  const url = new URL(value, 'https://kerf.invalid')
  if (value.includes('#') || !matchShell(routes.table, routes.root, url.pathname).found) return
  if (holes?.size) {
    const intended = matchShell(routes.table, routes.root, url.pathname, holes)
    const actual = matchShell(routes.table, routes.root, url.pathname)
    if (!intended.found || intended.ids.at(-1) !== actual.ids.at(-1)) return
  }
  return url.pathname + url.search
}

type ReturnTable = RouteTable & { site?: ShellSite }

function returnPath(routes: ReturnTable, parameter: string, value: string, current: URL) {
  const path = localDestination(routes, value)
  if (!path) return
  const target = new URL(path, current.origin)
  const identity = (url: URL) => {
    try {
      return decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase()
    } catch {
      return url.pathname
    }
  }
  if (identity(target) === identity(current)) return
  if (target.searchParams.has(parameter)) return
  for (const entry of Object.values(routes.site?.routeRedirects ?? {})) {
    if (typeof entry !== 'string' && entry.returnTo && target.searchParams.has(entry.returnTo))
      return
  }
  return path
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
  const path = localDestination(routes, expanded?.path, expanded?.holes)
  if (!path || destination.returnTo === undefined) return path
  if (!key.test(destination.returnTo)) return
  if (!from) return path
  const url = new URL(path, from.origin)
  const previous = returnPath(routes, destination.returnTo, from.pathname + from.search, url)
  if (!previous) return path
  url.searchParams.set(destination.returnTo, previous)
  const result = url.pathname + url.search
  return isRouteUrl(result) ? result : path
}

let release: ReturnTable | undefined

export function setReturnRoutes(routes: ReturnTable) {
  release = routes
}

/** Read one return-to query parameter at the current address, checked against this release. */
export function routeReturnTo(parameter: string): string | undefined {
  if (!release || !key.test(parameter)) return
  const current = new URL(location.href)
  const values = current.searchParams.getAll(parameter)
  return values.length === 1 ? returnPath(release, parameter, values[0]!, current) : undefined
}
