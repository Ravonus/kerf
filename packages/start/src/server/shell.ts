// Shell-mode page requests run only loaders. The browser owns the outlets and all presentation.
import { isNotFound } from '@tanstack/router-core'
import type { AsyncLocalStorage } from 'node:async_hooks'
import type { Scope } from '../exec'
import { RouteRedirect, type RouteDataSchema } from '../shell'
import { matchShell, redirectPath } from '../shell/routes'
import {
  SHELL_BYTES,
  SHELL_DEFERRED,
  SHELL_FRAME_BYTES,
  SHELL_MEDIA,
  SHELL_TIMEOUT,
  SHELL_VERSION,
  invalid,
  initialSchema,
  record,
  safeKey,
  validate,
  type Json,
} from '../shell/wire'
import { reportFailure } from './failure'
import { split } from './payload'
import { runLoader } from './routes'
import type { HandlerOptions, RouteModule } from './types'

interface Deferred {
  depth: number
  key: string
  value: Promise<unknown>
  schema: RouteDataSchema
}

const encode = (frame: object) => new TextEncoder().encode(JSON.stringify(frame) + '\n')

export function makeShellData(options: HandlerOptions, als: AsyncLocalStorage<Scope>) {
  const { manifest, modules, site = {}, build = null } = options
  const table = manifest.routes.filter((route) => route.kind === 'page')
  const levels = new Map(
    [...manifest.layouts, ...table].map((level) => [level.id, modules[level.file]]),
  )
  const root = manifest.layouts.find((layout) => !layout.dir)?.id
  return async (path: string, request: Request, scope: Scope): Promise<Response> => {
    if (request.method === 'HEAD') return new Response(null, { status: 405 })
    const local = matchShell(
      table,
      root,
      new URL(request.url).pathname.slice('/_kerf/data'.length) || '/',
    )
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(SHELL_TIMEOUT)])
    const target = new URL(request.url)
    target.pathname = path.split('?')[0]!
    const page = new Request(target, { method: request.method, headers: request.headers, signal })
    const load = async (id: string) =>
      runLoader(
        levels.get(id)?.load,
        { params: { ...local.params }, request: page, signal },
        scope,
        als,
      )
    const fail = (error: unknown) => shellReference(scope, options, error, path)
    const getSchema = (id: string) => levels.get(id)
    const { result, pending, status } = await resolveShell(local, site, load, getSchema, fail)
    const header = { v: SHELL_VERSION, build }
    const first = encode({ ...header, ...result })
    if (first.length > SHELL_FRAME_BYTES) {
      const reference = fail(new Error('Shell route data exceeds the frame budget'))
      return shellResponse(
        encode({ ...header, kind: 'error', values: [], reference }),
        [],
        signal,
        500,
      )
    }
    return shellResponse(first, pending, signal, status)
  }
}

function shellResponse(
  first: Uint8Array,
  pending: Deferred[],
  signal: AbortSignal,
  status: number,
) {
  return new Response(stream(first, pending, signal), {
    status,
    headers: { 'content-type': SHELL_MEDIA, 'cache-control': 'no-store' },
  })
}

async function resolveShell(
  local: ReturnType<typeof matchShell>,
  site: NonNullable<HandlerOptions['site']>,
  load: (id: string) => Promise<unknown>,
  moduleOf: (id: string) => RouteModule | undefined,
  fail: (error: unknown) => string,
) {
  const values: Json[] = []
  const pending: Deferred[] = []
  try {
    for (const [depth, id] of local.ids.entries()) {
      const module = moduleOf(id)
      if (module?.load && !module.routeData?.initial) invalid()
      const raw = await load(id).catch((error: unknown) => {
        if (isNotFound(error) || error instanceof RouteRedirect) return error
        throw error
      })
      if (raw instanceof RouteRedirect) {
        if (!redirectPath(site, raw.id)) invalid()
        return { result: { kind: 'redirect', id: raw.id }, pending: [], status: 200 }
      }
      if (isNotFound(raw)) return { result: { kind: 'not-found', values }, pending, status: 404 }
      const level = await prepareLevel(raw, module?.routeData, depth)
      if (pending.length + level.pending.length > SHELL_DEFERRED) invalid()
      values.push(level.value)
      pending.push(...level.pending)
    }
    return {
      result: { kind: local.found ? 'page' : 'not-found', values },
      pending,
      status: local.found ? 200 : 404,
    }
  } catch (error) {
    return { result: { kind: 'error', values, reference: fail(error) }, pending, status: 500 }
  }
}

function shellReference(scope: Scope, options: HandlerOptions, error: unknown, path: string) {
  return reportFailure(scope, options, error, { code: 'E_ROUTE', status: 500, route: path })
    .reference
}

async function prepareLevel(raw: unknown, schema: RouteDataSchema | undefined, depth: number) {
  const { data, d = [] } = split(raw)
  const keys = Object.keys(schema?.deferred ?? {})
  if (d.length !== keys.length || keys.some((key) => !safeKey(key) || !d.includes(key))) invalid()
  const value = await validate(initialSchema(schema), raw === undefined ? null : data)
  if (!keys.length) return { value, pending: [] }
  if (!record(raw) || !record(value) || keys.some((key) => Object.hasOwn(value, key))) invalid()
  return {
    value,
    pending: keys.map((key) => ({ depth, key, value: Promise.resolve(raw[key]), schema: schema! })),
  }
}

function stream(first: Uint8Array, pending: Deferred[], signal: AbortSignal) {
  let stop: () => void
  return new ReadableStream<Uint8Array>({
    start(out) {
      let open = true
      let bytes = first.length
      const close = () => {
        if (!open) return
        out.close()
        stop()
      }
      stop = () => {
        open = false
        signal.removeEventListener('abort', close)
      }
      out.enqueue(first)
      if (signal.aborted || !pending.length) return close()
      signal.addEventListener('abort', close, { once: true })
      const send = async ({ depth, key, value, schema }: Deferred) => {
        const fallback = () => encode({ kind: 'deferred-error', depth, key })
        let frame
        try {
          frame = encode({
            kind: 'deferred',
            depth,
            key,
            value: await validate(schema.deferred![key], await value),
          })
        } catch {
          frame = fallback()
        }
        if (!open) return
        if (frame.length > SHELL_FRAME_BYTES || bytes + frame.length > SHELL_BYTES)
          frame = fallback()
        if (bytes + frame.length > SHELL_BYTES) return close()
        bytes += frame.length
        out.enqueue(frame)
      }
      void Promise.all(pending.map(send)).then(close, close)
    },
    cancel() {
      stop()
    },
  })
}
