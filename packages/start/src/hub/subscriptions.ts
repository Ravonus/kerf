import { enter, fns, StartError, type Context, type Fn } from '../data'
import {
  createScope,
  guard,
  liveQueries,
  missedFeed,
  tagsOf,
  validate,
  type ScopeOptions,
} from '../exec'
import type { Source } from '../changes'
import type { Body, Conn, Limits, Sub, SubEntry } from './types'
import { RESET, Tracked } from './tracked'

interface Dependencies {
  limits: Limits
  source: Source | undefined
  deliver: (c: Conn, s: Sub, raw: string) => boolean
}

/** A subscription refused before it existed. */
const refuse = (c: Conn, n: number, e: StartError) =>
  c.sink.write('e', JSON.stringify([n, { code: e.code, message: e.message }]))

function fail(c: Conn, s: Sub, e: unknown) {
  remove(c, s)
  if (e instanceof StartError)
    return c.sink.write(
      'e',
      JSON.stringify([
        s.n,
        {
          code: e.code,
          message: e.message,
          ...(e.extra.issues ? { issues: e.extra.issues } : {}),
        },
      ]),
    )
  s.options.onDiagnostic?.({
    code: 'E_RT',
    severity: 'error',
    message: `${s.fn.$id}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
  })
  c.sink.write(
    'e',
    JSON.stringify([
      s.n,
      { message: s.options.dev && e instanceof Error ? e.message : 'Subscription failed.' },
    ]),
  )
}

function remove(c: Conn, s: Sub) {
  s.ac.abort()
  c.subs.delete(s.n)
  c.held.delete(s)
  for (const x of s.q) c.bytes -= x.size
  for (const t of s.tags) {
    const left = c.tags.get(t)! - 1
    left ? c.tags.set(t, left) : c.tags.delete(t)
  }
}

async function add(
  deps: Dependencies,
  c: Conn,
  entry: SubEntry,
  request: Request,
  scoped: ScopeOptions,
) {
  const { limits, source } = deps
  const [n, kind, id, input, cursor, buffer] = entry
  const fn = fns.get(id)
  if (c.subs.size >= limits.subscriptions)
    return refuse(
      c,
      n,
      new StartError(
        'R009',
        `this connection already has ${limits.subscriptions} subscriptions`,
        'read fewer keys, or raise `limits.subscriptions`',
      ),
    )
  if (!fn || fn.kind !== (kind === 'q' ? 'query' : 'stream'))
    return refuse(
      c,
      n,
      new StartError(
        'Q009',
        `no ${kind === 'q' ? 'query' : 'stream'} \`${id}\` (the page is older than the server): reload`,
      ),
    )
  if (c.subs.has(n)) return
  const s: Sub = {
    n,
    kind,
    fn,
    input,
    tags: [],
    buffer: buffer ?? 0,
    q: [],
    ac: new AbortController(),
    request,
    options: scoped,
  }
  c.subs.set(n, s) // before any await: a `d` that follows finds it
  try {
    const valid = await validate(fn, input)
    if (s.ac.signal.aborted) return
    if (kind === 's') return void stream(deps, c, s, valid, cursor)
    guard(fn, fn.def.auth ? await createScope(request, scoped).ctx() : ({} as Context))
    if (s.ac.signal.aborted) return
    s.tags = await tagsOf(fn, valid, createScope(request, scoped))
    for (const t of s.tags) c.tags.set(t, (c.tags.get(t) ?? 0) + 1)
    if (scoped.dev) {
      liveQueries.set(fn.$id, s.tags)
      if (source) missedFeed(fn, s.tags, source.tables, scoped.onDiagnostic)
      if (!s.tags.length)
        scoped.onDiagnostic?.({
          code: 'W053',
          severity: 'error',
          message: `\`${fn.$id}\` is read with \`.live()\` but declares no \`tags\`: no mutation can ever poke it. Add \`tags\` to the query`,
        })
    }
    c.sink.write('a', JSON.stringify([n, s.tags]))
  } catch (e) {
    fail(c, s, e)
  }
}

/** One stream's `run`: resumed with its cursor, restarted without one on a reset. */
async function stream(deps: Dependencies, c: Conn, s: Sub, input: unknown, cursor?: string) {
  const { limits, deliver } = deps
  const { signal } = s.ac
  for (;;) {
    try {
      const scope = createScope(s.request, s.options)
      const frame = s.options.dev
        ? Object.create(scope, { touched: { value: { read: new Set(), write: new Set() } } })
        : scope
      await enter(frame, async () => {
        const ctx = await scope.ctx()
        guard(s.fn, ctx)
        const replaced = s.options.handlers?.get(s.fn.$id) as
          | ((
              input: unknown,
              ctx: Context,
              o: { signal: AbortSignal; lastEventId: unknown },
            ) => unknown)
          | undefined
        const out = replaced
          ? replaced(input, ctx, { signal, lastEventId: cursor })
          : s.fn.def.run!({ input, ctx, signal, lastEventId: cursor })
        for await (const y of out as AsyncIterable<unknown>) {
          if (signal.aborted) return
          const [id, msg] = y instanceof Tracked ? [y.id, y.value] : [null, y]
          if (s.options.dev) await checked(s.fn, msg)
          const raw = JSON.stringify([s.n, id, msg])
          if (raw.length > limits.message)
            throw new StartError(
              'R008',
              `\`${s.fn.$id}\` yielded ${raw.length} bytes; a message may be ${limits.message}`,
              'send less, or an id the client fetches',
            )
          if (id !== null) cursor = id
          if (!deliver(c, s, raw)) throw RESET
        }
      })
      if (signal.aborted) return
      remove(c, s)
      c.sink.write('f', JSON.stringify([s.n]))
      return
    } catch (e) {
      if (signal.aborted) return
      if (e !== RESET) return fail(c, s, e)
      cursor = undefined
      c.sink.write('r', JSON.stringify([s.n]))
    }
  }
}

async function change(
  deps: Dependencies,
  c: Conn,
  request: Request,
  opts: ScopeOptions,
  body: Body,
) {
  for (const n of body.d ?? []) {
    const s = c.subs.get(n)
    if (s) remove(c, s)
  }
  await Promise.all((body.s ?? []).map((e) => add(deps, c, e, request, opts)))
}

async function checked(fn: Fn, msg: unknown) {
  const r = await fn.def.message?.['~standard'].validate(msg)
  if (r?.issues)
    throw new StartError(
      'C002',
      `\`${fn.$id}\` yielded a message its \`message\` schema rejects: ${r.issues.map((i) => `${i.path?.map((p) => (typeof p === 'object' ? p.key : p)).join('.') ?? ''}: ${i.message}`).join('; ')}`,
      'fix `run`, or the schema',
      { status: 500 },
    )
}

export function createSubscriptions(deps: Dependencies) {
  return {
    fail,
    change: change.bind(null, deps),
  }
}
