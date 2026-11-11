// Phase-4 basics without a server: the log line, request ids, health, function limits and cron.
import { afterEach, describe, expect, test, vi } from 'vitest'
import { serverLog, requestIdOf } from '../src/server/log'
import { health } from '../src/server/health'
import { handles } from '../src/db/core'
import { limitCall } from '../src/exec/limit'
import { createScope, memoryStore } from '../src/exec'
import { startCron } from '../src/server/cron'
import { defineCron, matcher } from '../src/cron'
import { CLIENT_IP, type Context, type Fn } from '../src/data'

describe('the server log', () => {
  afterEach(() => vi.restoreAllMocks())
  const d = {
    code: 'Q019',
    severity: 'error',
    message: 'Q019: too often',
    route: '/a',
    requestId: 'r1',
  }

  test("'json' writes one object per line, without the code repeated in the message", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    serverLog({ log: 'json' })(d)
    expect(JSON.parse(String(warn.mock.calls[0]![0]))).toMatchObject({
      level: 'error',
      code: 'Q019',
      message: 'too often',
      route: '/a',
      requestId: 'r1',
    })
  })

  test('the default is a readable line carrying the request id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    serverLog(undefined)(d)
    expect(warn.mock.calls[0]![0]).toBe('[weft] Q019 error (/a) [r1]: too often')
  })

  test("a proxy's x-request-id is kept only behind a trusted proxy, and only when it's plain", () => {
    const req = (id: string) => new Request('http://x/', { headers: { 'x-request-id': id } })
    expect(requestIdOf(req('abc-1'), { trustProxy: true })).toBe('abc-1')
    expect(requestIdOf(req('abc-1'), {})).not.toBe('abc-1')
    expect(requestIdOf(req('<script>'), { trustProxy: true })).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('/_weft/health', () => {
  afterEach(() => handles.clear())
  const handle = (ping: () => Promise<unknown>) =>
    ({ dialect: 'postgresql', exempt: new Set(), migrate: async () => {}, ping }) as never

  test('200 when every database answers', async () => {
    handles.add(handle(() => Promise.resolve()))
    const res = await health(false)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toMatchObject({ ok: true, db: [{ dialect: 'postgresql', ok: true }] })
  })

  test("503 when one doesn't, and production leaves out the driver's message", async () => {
    handles.add(handle(() => Promise.reject(new Error('connect ECONNREFUSED db.internal:5432'))))
    const res = await health(false)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.db[0]).toEqual({ dialect: 'postgresql', ok: false })
    expect((await (await health(true)).json()).db[0].error).toMatch(/ECONNREFUSED/)
  })
})

describe('limit', () => {
  const fn = (limit: Fn['def']['limit']) =>
    ({ kind: 'mutation', $id: 'm.send', def: { limit } }) as Fn
  const scope = (ip = '1.2.3.4') =>
    createScope(new Request('http://x/', { headers: { [CLIENT_IP]: ip } }))

  test('past max in the window it is 429 Q019 with Retry-After; another caller has its own count', async () => {
    const store = memoryStore()
    const f = fn({ max: 2, window: 60 })
    const anon = {} as Context
    await limitCall(f, anon, scope(), store)
    await limitCall(f, anon, scope(), store)
    const s = scope()
    await expect(limitCall(f, anon, s, store)).rejects.toMatchObject({
      code: 'Q019',
      extra: { status: 429 },
    })
    expect(Number(s.headers.get('retry-after'))).toBeGreaterThan(0)
    await expect(limitCall(f, anon, scope('5.6.7.8'), store)).resolves.toBeUndefined()
  })

  test("a signed-in user is counted as the user, wherever they call from, unless by: 'ip'", async () => {
    const store = memoryStore()
    const ada = { user: { id: 'ada' } } as unknown as Context
    const f = fn({ max: 1, window: 60 })
    await limitCall(f, ada, scope('1.1.1.1'), store)
    await expect(limitCall(f, ada, scope('2.2.2.2'), store)).rejects.toMatchObject({ code: 'Q019' })
    const byIp = fn({ max: 1, window: 60, by: 'ip' })
    await limitCall(byIp, ada, scope('1.1.1.1'), store)
    await expect(limitCall(byIp, ada, scope('2.2.2.2'), store)).resolves.toBeUndefined()
  })

  test('a window that has passed starts over', async () => {
    vi.useFakeTimers()
    try {
      const store = memoryStore()
      const f = fn({ max: 1, window: 1 })
      await limitCall(f, {} as Context, scope(), store)
      await expect(limitCall(f, {} as Context, scope(), store)).rejects.toMatchObject({
        code: 'Q019',
      })
      vi.advanceTimersByTime(1100)
      await expect(limitCall(f, {} as Context, scope(), store)).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('cron', () => {
  const at = (iso: string) => new Date(iso)

  test('schedules match their minutes in UTC', () => {
    expect(matcher('0 3 * * *')(at('2026-11-11T03:00:00Z'))).toBe(true)
    expect(matcher('0 3 * * *')(at('2026-11-11T03:01:00Z'))).toBe(false)
    expect(matcher('*/15 * * * *')(at('2026-11-11T10:45:00Z'))).toBe(true)
    expect(matcher('*/15 * * * *')(at('2026-11-11T10:46:00Z'))).toBe(false)
    expect(matcher('0 9 * * 1-5')(at('2026-11-14T09:00:00Z'))).toBe(false) // a Saturday
    expect(matcher('0 9 * * 1-5')(at('2026-11-13T09:00:00Z'))).toBe(true)
    expect(matcher('0 0 * * 7')(at('2026-11-15T00:00:00Z'))).toBe(true) // 7 is Sunday too
    expect(matcher('0 0 1,15 * 1')(at('2026-11-16T00:00:00Z'))).toBe(true) // day of month OR day of week
  })

  test("J002: a schedule that doesn't parse stops the server, naming the job", () => {
    expect(() => defineCron({ nightly: { schedule: '0 25 * * *', run: () => {} } })).toThrow(
      /J002.*nightly.*25/,
    )
    expect(() => matcher('0 3 * *')).toThrow(/J002.*4 fields/)
  })

  test('a due job runs once per minute across instances that share a store; a failure is J001', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-11T02:59:30Z') })
    try {
      const ran: string[] = []
      const diagnostics: string[] = []
      const store = memoryStore()
      const jobs = defineCron({
        nightly: { schedule: '0 3 * * *', run: ({ name }) => void ran.push(name) },
        broken: {
          schedule: '* * * * *',
          run: () => {
            throw new Error('nope')
          },
        },
      })
      const instance = () =>
        startCron(jobs, {
          scopeOptions: { onDiagnostic: (d) => void diagnostics.push(d.code) },
          store,
          boot: () => Promise.resolve(),
          origin: 'http://localhost',
          enter: (_scope, run) => run(),
        })
      const stops = [instance(), instance()]
      await vi.advanceTimersByTimeAsync(31_000)
      expect(ran).toEqual(['nightly'])
      expect(diagnostics).toEqual(['J001'])
      await vi.advanceTimersByTimeAsync(60_000)
      expect(ran).toEqual(['nightly']) // 03:01 isn't due
      for (const stop of stops) stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
