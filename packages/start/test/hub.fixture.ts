import { AsyncLocalStorage } from 'node:async_hooks'
import { query, stream, topic, type StandardSchemaV1 } from '@kerf/start'
import { hub, resetHub, type Body, type Sink } from '@kerf/start/hub'
import type { Poke } from '@kerf/start/changes'
import { createScope, liveQueries, type Scope } from '../src/exec'
import { runtime } from '@kerf/start/data'

export function createHubFixture() {
  // What server.tsx sets: the request scope, found through AsyncLocalStorage.
  const als = new AsyncLocalStorage<Scope>()
  runtime.scope = () => als.getStore()
  runtime.enter = (scope, fn) => als.run(scope as Scope, fn)

  const json = { 'content-type': 'application/json', 'x-kerf': '1' }
  const request = (body: unknown, headers: Record<string, string> = json) =>
    new Request('http://app.test/_kerf/rt', { method: 'POST', headers, body: JSON.stringify(body) })

  /** What each event's frame carries, as far as these tests read it. */
  type Frames = {
    h: { c: string }
    p: Poke
    m: [number, string, unknown]
    e: [number, { code: string }]
    a: [number, string[]]
    r: [number]
    f: [number]
    b: { retry: number }
    R: unknown
  }
  function sink(backlog = () => 0) {
    const frames: [string, unknown][] = []
    const s: Sink & { frames: [string, unknown][]; closed: boolean } = {
      frames,
      closed: false,
      write: (e, d) => void frames.push([e, JSON.parse(d)]),
      backlog,
      close() {
        s.closed = true
      },
    }
    return s
  }
  const open = async (body: Body, s = sink(), ctx: object = {}) => {
    const r = request(body)
    const c = await hub().connect(r, createScope(r, { context: () => ctx, dev: true }), body, s)
    return { c, s }
  }
  const of = <E extends keyof Frames>(s: { frames: [string, unknown][] }, e: E) =>
    s.frames.filter((f) => f[0] === e).map((f) => f[1] as Frames[E])

  const bare: StandardSchemaV1 = {
    '~standard': { version: 1, vendor: 't', validate: (v: unknown) => ({ value: v }) },
  }

  afterEach(async () => {
    await resetHub()
    liveQueries.clear()
  })

  const q = query({ $id: 'hub.q', tags: ['a', 'b'], run: () => 1 })
  const t = topic('hub', {
    message: { '~standard': { version: 1, vendor: 't', validate: (v: unknown) => ({ value: v }) } },
  })
  stream({
    $id: 'hub.feed',
    async *run({ signal, lastEventId }) {
      yield* t.subscribe('k', { signal, after: lastEventId })
    },
  })
  void q

  return { json, request, sink, open, of, bare, t }
}
