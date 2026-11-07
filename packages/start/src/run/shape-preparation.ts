import type { Component } from '../router'
import type { ClientRoutes, RouteShape } from '../run'
import { acquireShapeStyles } from './shape-styles'
import { PageSkeleton, PassThroughSkeleton } from './page-skeleton'

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
