// The route views (research 25 §3): `<App>` renders level 0, and each level renders its route's component with the
// next level as `children`. The same file compiles for the server and the client, so both build the same tree and
// hydration keys line up. A level's hole reads only its route id: params and data reach the component as live
// props, so a navigation that keeps the route re-runs only the bindings that read what changed.

import { untrack } from '@weft-js/core'
import { active, level, type RouteState } from './router'

// The route state travels as a prop, not a context: a level's view runs later, in the hole that shows it, under that
// hole's owner. `active.route` is the state of the render in progress (a server pass is synchronous; the client has one).
export function App(props: { route: RouteState }) {
  const route = (active.route = untrack(() => props.route))
  return <Level route={route} depth={0} />
}

export function Level(props: { route: RouteState; depth: number }) {
  const route = untrack(() => props.route)
  const lv = level(route, untrack(() => props.depth))
  const next = untrack(() => props.depth) + 1
  const view = () => {
    const id = lv.id.value
    if (id === undefined) return null
    const html = route.mount ? lv.html.value : undefined
    if (html !== undefined) return route.mount!(html, untrack(() => props.depth), () => <Level route={route} depth={next} />)
    const Route = route.comps[id]
    if (!Route) return null
    const body = () => <Route params={lv.params.value} data={lv.data.value}><Level route={route} depth={next} /></Route>
    return route.around ? route.around(untrack(() => props.depth), id, body) : body()
  }
  return <>{view()}</>
}

/**
 * `<a>` with `aria-current="page"` while its path is the current one. Any same-origin `<a href>` navigates on the
 * client (start() listens for clicks); Link only adds the current-page state. In a static level the server writes it
 * and start() updates it after a navigation, so a Link needs no code there.
 *
 * @weft static
 */
export function Link({ href, children, ...rest }: Record<string, unknown> & { href: string; class?: string; rel?: string; children?: unknown }) {
  const route = active.route
  return (
    <a {...rest} href={href} aria-current={route && route.path.value.replace(/[?#].*/, '') === href ? 'page' : undefined}>
      {children}
    </a>
  )
}
