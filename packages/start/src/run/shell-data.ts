// Admit the route outcome before constructing any component props.
import { clientRequest } from '../client-fetch'
import { isErrorReference } from '../failure'
import type { Match } from '../router'
import type { RouteDataSchema } from '../shell'
import { frames } from '../shell/read'
import { redirectPath, type matchShell, type ShellConfig } from '../shell/routes'
import {
  SHELL_BYTES,
  SHELL_DEFERRED,
  SHELL_MEDIA,
  SHELL_TIMEOUT,
  SHELL_VERSION,
  fields,
  invalid,
  record,
  safeKey,
  initialSchema,
  validate,
} from '../shell/wire'
import type { ClientRoutes } from '../run'

type Local = ReturnType<typeof matchShell>
type Schemas = (id: string) => Promise<RouteDataSchema | undefined>
type Frames = ReturnType<typeof frames>
type Deferred = {
  schema: NonNullable<RouteDataSchema['deferred']>[string]
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}
type Slots = Map<number, Map<string, Deferred>>
type Outcome =
  | { kind: 'redirect'; path: string }
  | {
      kind: 'page' | 'not-found' | 'error'
      matches: Match[]
      immediate: unknown[]
      reference?: string
    }

const base = ['v', 'build', 'kind']

export async function readShell({
  url,
  local,
  routes,
  schemas,
  signal,
}: {
  url: URL
  local: Local
  routes: ClientRoutes & { shell: ShellConfig }
  schemas: Schemas
  signal: AbortSignal
}): Promise<Outcome> {
  const lifetime = AbortSignal.any([signal, AbortSignal.timeout(SHELL_TIMEOUT)])
  const response = await clientRequest('/_kerf/data' + url.pathname + url.search, {
    method: 'GET',
    signal: lifetime,
    redirect: 'error',
    credentials: 'omit',
    cache: 'no-store',
    headers: { accept: SHELL_MEDIA },
  })
  if (
    response.redirected ||
    !shellMedia(response.headers.get('content-type')) ||
    !response.body ||
    Number(response.headers.get('content-length')) > SHELL_BYTES
  ) {
    void response.body?.cancel().catch(() => {})
    invalid()
  }
  const stream = frames(response.body, lifetime)
  const slots: Slots = new Map()
  try {
    const { value } = await stream.next()
    if (!record(value) || value.v !== SHELL_VERSION || value.build !== (routes.build ?? null))
      invalid()
    if (value.kind === 'redirect') {
      if (response.status !== 200 || !fields(value, [...base, 'id'])) invalid()
      const path = redirectPath(routes.shell.site, value.id)
      if (!path || !(await stream.next()).done) invalid()
      return { kind: 'redirect', path }
    }
    const outcome = await readLevels(value, { local, schemas, status: response.status, slots })
    if (slots.size) void settle(stream, slots)
    else if (!(await stream.next()).done) invalid()
    return outcome
  } catch (error) {
    rejectAll(slots)
    await stream.return(undefined)
    throw error
  }
}

function shellMedia(type: string | null) {
  return /^application\/x-ndjson(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(type ?? '')
}

async function readLevels(
  value: Record<string, unknown>,
  {
    local,
    schemas,
    status,
    slots,
  }: { local: Local; schemas: Schemas; status: number; slots: Slots },
): Promise<Outcome> {
  const { kind, values, reference } = value
  if (kind !== 'page' && kind !== 'not-found' && kind !== 'error') invalid()
  if (
    !fields(value, kind === 'error' ? [...base, 'values', 'reference'] : [...base, 'values']) ||
    !Array.isArray(values) ||
    values.length > local.ids.length
  )
    invalid()
  if (kind === 'page' && (status !== 200 || !local.found || values.length !== local.ids.length))
    invalid()
  if (
    kind === 'not-found' &&
    (status !== 404 || (local.found && values.length === local.ids.length))
  )
    invalid()
  if (
    kind === 'error' &&
    (status !== 500 ||
      !isErrorReference(reference) ||
      values.length >= Math.max(1, local.ids.length))
  )
    invalid()

  const immediate: unknown[] = []
  const matches: Match[] = []
  let deferred = 0
  for (const [depth, raw] of values.entries()) {
    const id = local.ids[depth]!
    const schema = await schemas(id)
    const data = await validate(initialSchema(schema), raw)
    immediate.push(schema ? data : undefined)
    const declared = Object.entries(schema?.deferred ?? {})
    deferred += declared.length
    if (deferred > SHELL_DEFERRED) invalid()
    matches.push({
      id,
      params: local.params,
      data: declared.length ? beginDeferred(slots, depth, declared, data) : immediate[depth],
    })
  }
  return { kind, matches, immediate, ...(isErrorReference(reference) && { reference }) }
}

function beginDeferred(
  slots: Slots,
  depth: number,
  declared: [string, Deferred['schema']][],
  value: unknown,
) {
  if (!record(value)) invalid()
  const data = { ...value }
  const level = new Map<string, Deferred>()
  slots.set(depth, level)
  for (const [key, schema] of declared) {
    if (!safeKey(key) || Object.hasOwn(data, key)) invalid()
    const promise = new Promise<unknown>((resolve, reject) => {
      level.set(key, { schema, resolve, reject })
    })
    void promise.catch(() => {})
    data[key] = promise
  }
  return data
}

const deferredError = () => new Error('Deferred route data is unavailable.')

function rejectAll(slots: Slots) {
  for (const level of slots.values())
    for (const slot of level.values()) slot.reject(deferredError())
}

async function settle(stream: Frames, slots: Slots) {
  try {
    for await (const value of stream) {
      if (!record(value) || typeof value.depth !== 'number' || typeof value.key !== 'string')
        invalid()
      const { kind, depth, key } = value
      const level = slots.get(depth)
      const slot = level?.get(key)
      if (!slot) invalid()
      if (kind === 'deferred' && fields(value, ['kind', 'depth', 'key', 'value']))
        slot.resolve(await validate(slot.schema, value.value))
      else if (kind === 'deferred-error' && fields(value, ['kind', 'depth', 'key']))
        slot.reject(deferredError())
      else invalid()
      level!.delete(key)
    }
  } catch {
    // Only still-pending slots fail. Values already admitted remain usable.
  } finally {
    rejectAll(slots)
  }
}
