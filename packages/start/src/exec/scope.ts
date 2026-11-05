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
