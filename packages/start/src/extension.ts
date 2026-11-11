// `server.extension@1`: how a plugin reaches the server without a private path. One provider per key adds what it needs,
// and only an app with `src/<key>.server.ts` runs it, so nothing arrives behind the app's back (P118). The provider exports
// a function from that file's default export to a `ServerExtension`; `weft docs plugins` has a worked example.
//
// Four things, each optional. Routes live under `/_weft/x/<key>/`. `context` adds to `ctx`. `guard` runs before every server
// function, and options it reads come from augmenting `FnOptions`. `check` runs before the first request.

import type { Context } from './data'

/** The path prefix an extension's routes answer under. */
export const EXTENSION = '/_weft/x/'

/** What a server extension is handed. */
export interface ExtensionApi {
  /** Drop these tags, as a mutation would: live readers refetch. */
  invalidate(tags: string[]): Promise<void>
  /** The server log. */
  report(d: { code: string; severity: string; message: string }): void
  /** This request's `ctx`, with every extension's part. */
  ctx(): Promise<Context>
  /** Run a query or mutation by `$id` as this request's caller, with its schema, `auth` and every `guard`. */
  call(id: string, input: unknown): Promise<unknown>
}

/** A plugin's server half: its routes, what it adds to `ctx`, and what it guards. */
export interface ServerExtension {
  /** Serves `/_weft/x/<key>/<path>`. It sees the raw request: nothing has read the body. */
  handle?(request: Request, path: string, api: ExtensionApi): Promise<Response> | Response
  /** Merged into `ctx`, after the app's own. It may replace `user` (a caller with a token) and may look things up first. */
  context?(ctx: Context): object | Promise<object>
  /** Before a function's `run`. Throw to refuse: an error with `answer: { code, message, status }` reaches the client as it is. */
  guard?(
    fn: { id: string; kind: string; def: Record<string, unknown> },
    ctx: Context,
  ): void | Promise<void>
  /** The `FnOptions` keys it enforces. One no extension claims refuses the call: a guard that isn't there mustn't pass. */
  options?: readonly string[]
  /** The `ctx` keys that differ per user, which a shared cache may not read (Q006). */
  personal?: readonly string[]
  /** Before the first request, never in a build: throw for a server that can't run safely. */
  check?(dev?: boolean): void
}

/** One extension in the generated list, loaded when first asked for. */
export interface ExtensionEntry {
  key: string
  load(): Promise<ServerExtension>
}
