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
 */
export function start(routes: ClientRoutes, options: { container?: Element; eager?: boolean } = {}): ReturnType<typeof run> {
  return new Promise((settle, fail) => {
    const full = () => import('./run').then(m => m.start(routes, options)).then(settle).catch(e => (fail(e), Promise.reject(e)))
    options.eager ? void full() : boot(full)
  })
}
