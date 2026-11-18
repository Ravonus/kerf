// How the browser reaches the app's server for what Kerf itself asks it: server functions (`/_kerf/fn/<id>`) and route
// data (`/_kerf/data/<path>`, a `load`'s answer on a client navigation, a prefetch or a deferred field). The page's
// origin by default; an app whose page origin is only where the first load comes from replaces it with `clientFetch`.

/**
 * One request from the client runtime: `path` starts with `/_kerf/`, and `init` is what `fetch` would get (the
 * method, headers and body Kerf's server expects, and a signal when the caller can give up). Answer with the
 * server's `Response`.
 */
export type ClientFetch = (path: string, init: RequestInit) => Promise<Response>

let custom: ClientFetch | undefined

/**
 * Send the client runtime's own requests through `send` and not `fetch` on the page's origin: every query and
 * mutation a component calls, and the route data a client navigation or a prefetch asks for. The query cache,
 * dedupe, tags and invalidation work as they do by default, since only the wire changes. Call it once, before
 * `start()`, in `src/entry.client.ts`; `clientFetch(undefined)` goes back to the default. It does nothing on the
 * server, where a query runs in process. An SSR document load, SSR realtime and assets bypass it.
 * Shell mode uses it for all route data reads, operations, bootstrap and SSE. Preserve its abort
 * signal, redirect refusal, cache policy and credential omission.
 *
 *   clientFetch((path, init) => fetch(new URL(path, pick()), { ...init, credentials: 'include' }))
 *
 * Another origin has to allow the request (CORS). Kerf's own server answers a mutation only from its own origin (the
 * CSRF check, Q010), so a mutation sent elsewhere needs a server or proxy there that accepts it.
 */
export function clientFetch(send: ClientFetch | undefined) {
  custom = send
}

/** The request, through the app's `clientFetch` when it set one. */
export const clientRequest = (path: string, init: RequestInit): Promise<Response> =>
  custom ? custom(path, init) : fetch(path, init)
