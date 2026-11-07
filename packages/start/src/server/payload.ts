import type { Stream } from '@weft-js/core/ssr'
import type { RoutePayload } from '../router'
import type { Wire } from '../data'
import * as exec from '../exec'
import type { Scope } from '../exec'
import { selectRouteAssets } from '../asset-receipt.mjs'
import { json, thenable } from './text'
import type { HandlerOptions, Resolved } from './types'

export function fill(pattern: string, params: Record<string, string>, splat?: string) {
  return pattern.replace(/\$([\w$]*)/g, (_, n) =>
    n ? encodeURIComponent(params[n]!) : (params[splat!] ?? ''),
  )
}

/** The data without its deferred (promise) fields, and their names. */
export function split(raw: unknown): { data: unknown; d?: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { data: raw }
  const fields = raw as Record<string, unknown>
  const d = Object.keys(raw).filter((k) => thenable(fields[k]))
  if (!d.length) return { data: raw }
  for (const k of d) Promise.resolve(fields[k]).catch(() => {}) // a deferred failure surfaces in its Boundary
  return { data: Object.fromEntries(Object.entries(raw).filter(([k]) => !d.includes(k))), d }
}

/** What `meta` and cards see: the settled data. Reading a deferred field is H007 (it's still streaming). */
export function settledView(
  raw: unknown,
  deferred: string[] | undefined,
  id: string,
  options: HandlerOptions,
) {
  if (!deferred?.length) return raw
  return new Proxy(raw as object, {
    get(t, k, r) {
      if (typeof k === 'string' && deferred.includes(k)) {
        const message = `H007 \`meta\` (or a card) of route ${id} reads \`data.${k}\`, a deferred field that is still streaming. Await it in \`load\`, or leave it out of \`meta\`.`
        options.onDiagnostic?.({ code: 'H007', severity: 'error', message, route: id })
        throw Object.assign(new Error(message), { code: 'H007' })
      }
      return Reflect.get(t, k, r)
    },
  })
}

export function payloadOf(r: Resolved, withHead: boolean, options?: HandlerOptions): RoutePayload {
  const { jsonLd: _, ...head } = r.head // only a first response carries it (`metaTags`)
  const assetBytes = selectRouteAssets(
    options?.routeAssetBytes,
    options?.build,
    r.levels.map((level) => level.id),
  )
  return {
    m: r.levels.map(({ id, params, data, d, t }) => ({
      id,
      params,
      data,
      ...(d && { d }),
      ...(t && { t }),
    })),
    p: r.path,
    s: r.status,
    ...(assetBytes && { a: assetBytes }),
    ...(withHead && { h: head }),
  }
}

export const dataTags = (data: unknown, cached: Wire[]) =>
  `<script type="application/json" id="weft-data">${json(data)}</script>\n` +
  (cached.length
    ? `<script type="application/json" id="weft-cache">${json(cached)}</script>\n`
    : '')

/** A render's data as a page may carry it: what failed says only what `exec.shown` let through. */
export function pageData(data: ReturnType<Stream['data']>, scope: Scope) {
  return data && { ...data, r: scrubbed(data.r, scope) }
}

export const scrubbed = (r: Record<string, { v?: unknown; e?: string }>, scope: Scope) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [k, v.e === undefined ? v : { e: exec.said(v.e, scope) }]),
  )

/** The request's resolved queries, as the client cache seeds them (failures are left for the client to retry). */
export function wire(scope: Scope): Wire[] {
  return [...scope.entries.values()]
    .filter((e) => e.done && e.e === undefined)
    .map((e) => [e.id, e.input, e.v, e.tags])
}
