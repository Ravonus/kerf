// The route views (research 25 §3): `<App>` renders level 0, and each level renders its route's component with the
// next level as `children`. The same file compiles for the server and the client, so both build the same tree and
// hydration keys line up. A level's hole reads only its route id: params and data reach the component as live
// props, so a navigation that keeps the route re-runs only the bindings that read what changed.

import { untrack } from '@weft-js/core'
import { active, level, type RouteState } from './router'
import type { PreparedRouteShape } from './run/shape-preparation'
import { retainRouteView } from './run/retain-view'

function ShapeTree(props: { shapes: PreparedRouteShape[]; depth: number }): unknown {
  // A skeleton is a snapshot: the outlet swaps the whole tree when its shapes change.
  const item = untrack(() => props.shapes[props.depth])
  if (!item) return null
  const Shape = item.component as (props: { children: unknown }) => unknown
  return (
    <Shape>
      <ShapeTree shapes={props.shapes} depth={props.depth + 1} />
    </Shape>
  )
}

// The route state travels as a prop, not a context: a level's view runs later, in the hole that shows it, under that
// hole's owner. `active.route` is the state of the render in progress (a server pass is synchronous; the client has one).
export function App(props: { route: RouteState }) {
  const route = (active.route = untrack(() => props.route))
  return <Level route={route} depth={0} />
}

export function Level(props: { route: RouteState; depth: number }) {
  const route = untrack(() => props.route)
  const lv = level(
    route,
    untrack(() => props.depth),
  )
  const next = untrack(() => props.depth) + 1
  const view = () => {
    const id = lv.id.value
    if (id === undefined) return null
    const html = route.mount ? lv.html.value : undefined
    if (html !== undefined)
      return route.mount!(
        html,
        untrack(() => props.depth),
        () => <Level route={route} depth={next} />,
      )
    const Route = route.comps[id] as
      | ((props: { params: Record<string, string>; data: unknown; children: unknown }) => unknown)
      | undefined
    if (!Route) return null
    const body = () => (
      <Route params={lv.params.value} data={lv.data.value}>
        <Level route={route} depth={next} />
      </Route>
    )
    return route.around
      ? route.around(
          untrack(() => props.depth),
          id,
          body,
        )
      : body()
  }
  const display = retainRouteView(view, () => {
    const shape = lv.shape.value
    return shape ? (
      <div inert aria-hidden="true" style="display:contents">
        <ShapeTree shapes={shape} depth={0} />
      </div>
    ) : undefined
  })
  return <>{display()}</>
}

/**
 * `<a>` with `aria-current="page"` while its path is the current one. Any same-origin `<a href>` navigates on the
 * client (start() listens for clicks); Link only adds the current-page state. In a static level the server writes it
 * and start() updates it after a navigation, so a Link needs no code there.
 *
 * @weft static
 */
export function Link({
  href,
  children,
  ...rest
}: Record<string, unknown> & { href: string; class?: string; rel?: string; children?: unknown }) {
  const route = active.route
  return (
    <a
      {...rest}
      href={href}
      aria-current={route && route.path.value.replace(/[?#].*/, '') === href ? 'page' : undefined}
    >
      {children}
    </a>
  )
}

/**
 * The current page's path, without its search or hash: the request's on the server, and on the client the accepted
 * destination from the moment a navigation starts. Reading it is reactive.
 *
 * Use it to keep shared chrome mounted across sections: one layout above them renders the sidebar and picks its items
 * from the path, so moving between sections swaps the items and the page, and the sidebar stays. A layout per section
 * would be replaced, sidebar and all, on every move between them.
 *
 * What reads it runs in the browser, since it changes there: a static level's HTML would be swapped whole on each move.
 *
 * @weft client
 */
export function currentPath(): string {
  return active.route?.path.value.replace(/[?#].*/, '') ?? '/'
}
