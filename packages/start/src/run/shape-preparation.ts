import { flush } from '@kerf/core'
import { level, type Component } from '../router'
import type { ClientRoutes, RouteShape } from '../run'
import { acquireShapeStyles } from './shape-styles'
import { PageSkeleton, PassThroughSkeleton } from './page-skeleton'
import type { Navigation } from './navigation'

export interface PreparedRouteShape {
  kind: 'generated' | 'override'
  component: Component
  /** Provided CSS is installed; its dependency closure remains unproven. */
  ready: true
  completeness: 'partial'
  release(): void
}

type Renderable = Extract<RouteShape, { kind: 'generated' | 'override' }>

/** Prepare the selected generated or custom shape without rendering it. */
export function prepareRouteShape(
  routes: ClientRoutes,
  id: string,
  doc: Document,
): PreparedRouteShape | null {
  const shape = routes.shapes?.[id]
  if (!shape || (shape.kind !== 'generated' && shape.kind !== 'override')) return null
  // A shape with no structure of its own would leave the outlet blank: a page's outline stands in, and a layout's
  // place goes to its page's.
  if (shape.thin)
    return prepare(
      {
        ...shape,
        component: id.startsWith('layout:') ? PassThroughSkeleton : PageSkeleton,
      },
      routes.build,
      doc,
    )
  return prepare(shape, routes.build, doc)
}

function prepare(
  shape: Renderable,
  build: string | null | undefined,
  doc: Document,
): PreparedRouteShape | null {
  const lease = acquireShapeStyles(doc, build, shape.cssText)
  if (!lease) return null
  return {
    kind: shape.kind,
    component: shape.component,
    ready: true,
    completeness: shape.cssStatus,
    // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
    release: lease.release,
  }
}

/** Prepare all changed levels before replacing the current outlet. */
export function presentShape(nav: Navigation, ids: string[], url: URL, force: boolean) {
  let first = ids.findIndex((id, depth) => nav.route.levels[depth]?.id.value !== id)
  if (first < 0) first = force ? ids.length - 1 : nav.changedParams(ids, url)
  if (first < 0) {
    const committed = new URL(nav.committedURL)
    if (url.pathname === committed.pathname && url.search === committed.search) nav.clearShape()
    return false
  }
  if (!nav.route.prepareShape) return false
  const leases: PreparedRouteShape[] = []
  try {
    for (const id of ids.slice(first)) {
      const lease = nav.route.prepareShape(id)
      if (!lease) {
        leases.forEach((item) => item.release())
        return false
      }
      leases.push(lease)
    }
  } catch {
    leases.forEach((item) => item.release())
    return false
  }
  // A same-id layout stays mounted; its existing child outlet owns the presentation.
  let depth = first
  while (depth < ids.length - 1 && nav.route.levels[depth]?.id.value === ids[depth]) depth++
  const retained = leases.splice(0, depth - first)
  retained.forEach((lease) => lease.release())
  const outlet = level(nav.route, depth)
  const old = nav.detachShape()
  outlet.shape.value = leases
  nav.shape = { outlet, leases }
  try {
    flush()
  } finally {
    old?.forEach((lease) => lease.release())
  }
  return true
}
