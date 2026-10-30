// The route views (research 25 §3): `<App>` renders level 0, and each level renders its route's component with the
// next level as `children`. The same file compiles for the server and the client, so both build the same tree and
// hydration keys line up. A level's hole reads only its route id: params and data reach the component as live
// props, so a navigation that keeps the route re-runs only the bindings that read what changed.

import { untrack } from 'weft'
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
    const Route = route.comps[id]
    return Route ? <Route params={lv.params.value} data={lv.data.value}><Level route={route} depth={next} /></Route> : null
  }
  return <>{view()}</>
}

/**
 * `<a>` with `aria-current="page"` while its path is the current one. Any same-origin `<a href>` navigates on the
 * client (start() listens for clicks); Link only adds the current-page state.
 */
export function Link(props: { href: string; class?: string; children?: unknown }) {
  const route = active.route
  return (
    <a href={props.href} class={props.class} aria-current={route && route.path.value.replace(/[?#].*/, '') === props.href ? 'page' : undefined}>
      {props.children}
    </a>
  )
}
