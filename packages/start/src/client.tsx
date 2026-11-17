// What an app's entry imports. `run.tsx` is the client: the router, the runtime and whatever hydrates. It's a chunk of its
// own so a page with only lazy islands can be read without it (`boot.ts`, PLAN §11); a page with work to do has it
// preloaded, and starts it at once.

import './gate.css'
import { boot } from './boot'
import type { ClientRoutes, start as run } from './run'

export type { ClientRoutes } from './run'

/**
 * Hydrate the page in `#app` and take over its links. Resolves once hydrated, which on a page of lazy islands is when
 * one is first needed. `eager`: don't wait for that.
 *
 * `shell`: the document is one page sent for every address, by a place that holds only the app's files (an edge in
 * front of the servers `clientFetch` reaches). The app starts at once and goes to the address the visitor asked
 * for, reading its route data through `clientFetch`. While no server answers, the shell stays up and the read is
 * tried again; the page is never loaded again to recover, since that would only bring the shell back.
 */
export function start(
  routes: ClientRoutes,
  options: { container?: Element; eager?: boolean; shell?: boolean } = {},
): ReturnType<typeof run> {
  return new Promise((settle, fail) => {
    const full = () =>
      import('./run')
        .then((m) => m.start(routes, options))
        .then(settle)
        .catch((e) => (fail(e), Promise.reject(e)))
    options.eager || options.shell ? void full() : boot(full)
  })
}
