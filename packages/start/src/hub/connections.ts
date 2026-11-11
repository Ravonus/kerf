import { StartError, type Context } from '../data'
import { createScope, guard, signedIn, type Scope, type ScopeOptions } from '../exec'
import type { Source } from '../changes'
import type { Body, Channel, Conn, HubOptions, Limits, Sink, Sub } from './types'

const unref = <T>(t: T) => ((t as { unref?(): void } | null | undefined)?.unref?.(), t)
interface Dependencies {
  conns: Map<string, Conn>
  limits: Limits
  epoch: string
  options: HubOptions
  source: Source | undefined
  pokes: () => Channel
  want: () => Promise<unknown> | undefined
  rest: () => void
  cursorOf: (n: number) => string
  seq: () => number
  wire: () => { m: string; d?: number }
  change: (c: Conn, request: Request, opts: ScopeOptions, body: Body) => Promise<void>
  replayPokes: (c: Conn, after: string) => void
  fail: (c: Conn, s: Sub, e: unknown) => void
}

function bye(deps: Dependencies, c: Conn, retry: number) {
  c.sink.write('b', JSON.stringify({ retry }))
  close(deps, c)
}

function close(deps: Dependencies, c: Conn) {
  const { conns, rest } = deps
  if (!conns.delete(c.k)) return
  for (const t of c.timers) clearTimeout(t)
  for (const s of c.subs.values()) s.ac.abort()
  c.subs.clear()
  c.sink.close()
  rest()
}

async function recheck(deps: Dependencies, c: Conn) {
  const { conns, fail } = deps
  const authed = [...c.subs.values()].filter((s) => signedIn(s.fn))
  if (!authed.length) return
  const ctx = await createScope(authed[0]!.request, authed[0]!.options)
    .ctx()
    .catch(() => ({}) as Context)
  if (!conns.has(c.k)) return
  for (const s of authed) {
    try {
      await guard(s.fn, ctx)
    } catch (e) {
      fail(c, s, e)
    }
  }
}

async function connect(
  deps: Dependencies,
  a: { request: Request; scope: Scope; body: Body; sink: Sink; line: boolean },
) {
  const { request, scope, body, sink, line } = a
  const {
    conns,
    limits,
    epoch,
    options,
    source,
    pokes,
    want,
    cursorOf,
    seq,
    wire,
    change,
    replayPokes,
  } = deps
  const opts = scope.options
  const ctx = await scope.ctx()
  const user = (ctx as { user?: { id?: string } }).user?.id
  if (
    !line &&
    user !== undefined &&
    [...conns.values()].filter((c) => c.user === user).length >= limits.connections
  ) {
    throw new StartError(
      'R009',
      `user \`${user}\` already has ${limits.connections} realtime connections`,
      'close tabs, or raise `limits.connections`',
      { status: 429 },
    )
  }
  const c: Conn = {
    k: crypto.randomUUID(),
    sink,
    user,
    subs: new Map(),
    tags: new Map(),
    held: new Set(),
    bytes: 0,
    timers: [],
  }
  conns.set(c.k, c)
  await pokes().ready.catch((e) => {
    conns.delete(c.k)
    throw e
  })
  await want() // before `h`: a client that reads next must not miss a change
  sink.write(
    'h',
    JSON.stringify({
      k: c.k,
      e: epoch,
      b: options.build ?? '',
      c: cursorOf(seq()),
      ...(source && { l: wire() }),
    }),
  )
  await change(c, request, opts, body)
  if (body.c) replayPokes(c, body.c)
  startTimers(deps, c, sink)
  return c
}

function startTimers(deps: Dependencies, c: Conn, sink: Sink) {
  const { limits, options } = deps
  let ticks = 0
  const every = Math.max(1, Math.round(limits.session / limits.heartbeat))
  c.timers.push(
    unref(
      setInterval(() => {
        sink.ping?.()
        if (++ticks % every === 0) void recheck(deps, c)
      }, limits.heartbeat),
    ),
  )
  if (options.maxDuration)
    c.timers.push(
      unref(setTimeout(() => bye(deps, c, 0), Math.max(1, options.maxDuration - 10) * 1000)),
    )
}

export function createConnections(deps: Dependencies) {
  return {
    bye: (c: Conn, retry: number) => bye(deps, c, retry),
    close: (c: Conn) => close(deps, c),
    connect: (request: Request, scope: Scope, body: Body, sink: Sink, line = false) =>
      connect(deps, { request, scope, body, sink, line }),
  }
}
