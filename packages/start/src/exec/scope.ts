import type { MediaAsset } from '@weft-js/core/media'
import type { ServerExtension } from '../extension'
import { StartError, type Context } from '../data'
import { dbError } from './errors'

export interface ScopeEntry {
  id: string
  input: unknown
  p: Promise<ScopeEntry>
  /** A render's read of it (`landed`). */
  read?: Promise<unknown>
  done?: boolean
  v?: unknown
  e?: unknown
  tags: string[]
}

export interface Scope {
  request: Request
  entries: Map<string, ScopeEntry>
  /** Tags a mutation or `invalidate()` dropped during this request. */
  invalidated: Set<string>
  /** Response headers the functions set (cookies), merged into the response. */
  headers: Headers
  /** The page's first byte went out: a redirect can't change the status any more (Q007). */
  started?: boolean
  /** The tags of the queries a route level's `load` read (a frame per loader; research 27 §4). */
  tags?: Set<string>
  /** Dev: the tables this function's statements read and wrote (a frame per `run`; research 28 §2). */
  touched?: Touched
  /** A no-JS form POST that failed: `<Form>` renders it into the page (research 29 §5). */
  form?: FormFailure
  /** Failure messages meant for the visitor, the only ones a production page may carry (`shown`). */
  said: Set<string>
  /** The render read a live query or a stream: the page carries the realtime cursor (research 30 §1). */
  live?: boolean
  /** A preview (the `weft-preview` cookie, `preview.start`): its queries never read or write the shared cache, so what
   * it sees (a draft, applied in a transaction the app rolls back) can't reach anyone else. */
  preview: boolean
  /** Work for when the response is finished (`after`): a rollback, a snapshot, a push. */
  after: (() => unknown)[]
  /** The response is finished and `after` has run: a later `after` runs at once. */
  finished?: boolean
  ctx(): Promise<Context>
  options: ScopeOptions
}

export interface Touched {
  read: Set<string>
  write: Set<string>
}

export interface FormFailure {
  id: string
  key?: string
  values: Record<string, unknown>
  errors: Record<string, string>
  message?: string | undefined
  status: number
}

/** The `media.server@1` provider (`@weft-js/plugin-media/server`, research 29 §6). */
export interface MediaServer {
  ingest(bytes: Uint8Array, options: { name?: string }): Promise<MediaAsset>
  serve(want: { hash: string; width: number; format: string; accept: string }): Promise<{
    bytes: Uint8Array
    type: string
    width: number
    format: string
    negotiated: boolean
    temporary?: boolean
  } | null>
}

export interface ScopeOptions {
  /** The app's context (`src/context.server.ts`). */
  context?: ((args: { request: Request }) => object | Promise<object>) | undefined
  store?: Store | undefined
  /** Tests (@weft-js/core/test `net.handle`): a replacement `run` by function id. */
  handlers?: Map<string, (input: unknown, ctx: Context) => unknown>
  onDiagnostic?: ((d: { code: string; severity: string; message: string }) => void) | undefined
  dev?: boolean | undefined
  media?: (() => Promise<MediaServer> | undefined) | undefined
  /** What plugins add through `server.extension` (extension.ts). */
  extensions?: ServerExtension[] | undefined
}

/** The cookie `preview.start` sets. Its value is the app's (a draft's id); weft only reads that it's there. */
export const PREVIEW_COOKIE = 'weft-preview'
const PREVIEW = /(?:^|;\s*)weft-preview=[^;]/

export function createScope(request: Request, options: ScopeOptions = {}): Scope {
  const headers = new Headers()
  let ctx: Promise<Context> | undefined
  return {
    request,
    entries: new Map(),
    invalidated: new Set(),
    headers,
    options,
    said: new Set(),
    preview: PREVIEW.test(request.headers.get('cookie') ?? ''),
    after: [],
    // oxlint-disable typescript/no-unnecessary-type-assertion -- needed where a plugin such as pay adds required fields to Context
    ctx: () =>
      (ctx ??= Promise.resolve()
        .then(() => options.context?.({ request }) ?? {})
        .then(
          (app) =>
            extended(
              {
                ...app,
                request,
                response: { headers },
                media: mediaApi(options),
              } /* oxlint-enable typescript/no-unnecessary-type-assertion */ as Context,
              options,
            ),
          (e) => {
            throw dbError(e)
          },
        )),
  }
}

/** Each extension's part of `ctx`, once the app's is there: an extension reads `ctx.user` to say what it adds. */
function extended(ctx: Context, options: ScopeOptions): Context {
  for (const e of options.extensions ?? []) Object.assign(ctx, e.context?.(ctx))
  return ctx
}

/** `ctx.media`. A refusal is the user's answer, with its own status; `<Form>` shows it. */
const mediaApi = (options: ScopeOptions): Context['media'] => ({
  async ingest(file, { name } = {}) {
    const server = await options.media?.()
    if (!server)
      throw new StartError(
        'M017',
        '`ctx.media` needs a `media.server` provider',
        'add `media()` from `@weft-js/plugin-media` to `plugins` in weft.config.ts',
        { status: 500 },
      )
    const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer())
    try {
      return await server.ingest(bytes, { name: name ?? (file as File).name })
    } catch (e) {
      const { code, message } = e as Error & { code?: string }
      throw code ? new StartError(code, message, undefined, { status: 422 }) : e
    }
  },
})

/** A child scope for one loader: the same entries, its own `tags` collector. */
export const frame = (scope: Scope): Scope =>
  Object.create(scope, { tags: { value: new Set<string>() } })

// ---- the shared tagged cache --------------------------------------------------------------------------------------

/** Where `cache: { life }` values live. Memory by default; Nitro storage (fs, KV, Redis) plugs in here. */
export interface Store {
  get(key: string): Stored | undefined | Promise<Stored | undefined>
  set(key: string, value: Stored): void | Promise<void>
  /** The current version of each tag (0 for one never bumped). */
  versions(tags: string[]): number[] | Promise<number[]>
  bump(tags: string[]): void | Promise<void>
}
export interface Stored {
  v: unknown
  tags: string[]
  versions: number[]
  expires: number
}

export function memoryStore(): Store {
  const values = new Map<string, Stored>()
  const tags = new Map<string, number>()
  return {
    get: (k) => values.get(k),
    set: (k, v) => void values.set(k, v),
    versions: (t) => t.map((x) => tags.get(x) ?? 0),
    bump: (t) => {
      for (const x of t) tags.set(x, (tags.get(x) ?? 0) + 1)
    },
  }
}

export const defaultStore = memoryStore()

/** The response is done: run what `after` queued, each once, a failure a diagnostic that stops none of the rest. */
export async function finishScope(scope: Scope) {
  if (scope.finished) return
  scope.finished = true
  for (const fn of scope.after.splice(0))
    try {
      await fn()
    } catch (e) {
      scope.options.onDiagnostic?.({
        code: 'E_AFTER',
        severity: 'error',
        message: `an \`after()\` task failed: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
}

/**
 * `response` with `finishScope` run when its body has been read to the end, failed, or been abandoned by the client.
 * A response whose request queued nothing, and isn't a preview, goes out untouched (a preview's context may queue its
 * rollback while the page is still streaming).
 */
export function finishing(response: Response, scope: Scope): Response {
  if (!response.body || (!scope.after.length && !scope.preview)) {
    void finishScope(scope)
    return response
  }
  const reader = response.body.getReader()
  const end = () => void finishScope(scope)
  const body = new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        const { value, done } = await reader.read()
        if (done) {
          c.close()
          end()
        } else c.enqueue(value)
      } catch (e) {
        c.error(e)
        end()
      }
    },
    cancel(reason) {
      end()
      return reader.cancel(reason)
    },
  })
  return new Response(body, response)
}
