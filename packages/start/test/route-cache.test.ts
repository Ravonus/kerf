import { expect, it, vi } from 'vitest'
import { RouteCache } from '../src/run/cache'

const headers = { 'cache-control': 'private, max-age=0, stale-while-revalidate=30',
  vary: 'Accept, Cookie, Authorization', etag: '"one"' }
const url = (path: string) => new URL(path, 'http://localhost')
const body = (path: string, data: unknown = 'ok') => JSON.stringify({ p: path, s: 200,
  m: [{ id: '/page', params: {}, data, t: ['posts'] }] })
const response = (text: string, extra: HeadersInit = {}) => new Response(text,
  { status: 200, headers: { ...headers, ...extra } })
const notModified = () => new Response(null, { status: 304, headers })
const signal = () => new AbortController().signal

it('validates keyed entries and retains the original query generation', async () => {
  const cache = new RouteCache('build')
  const fetcher = vi.fn().mockResolvedValueOnce(response(body('/a?x=1&y=2')))
    .mockResolvedValueOnce(notModified())
    .mockResolvedValueOnce(response(body('/a?y=2&x=1')))
  const first = await cache.read(url('/a?x=1&y=2#first'), signal(), fetcher, () => 7, () => true)
  const again = await cache.read(url('/a?x=1&y=2#second'), signal(), fetcher, () => 19, () => true)
  await cache.read(url('/a?y=2&x=1'), signal(), fetcher, () => 20, () => true)
  expect(first.since).toBe(7)
  expect(again.since).toBe(7)
  expect(fetcher.mock.calls.map((args) => args[2])).toEqual([undefined, '"one"', undefined])
})

it('evicts by count and decoded UTF-8 bytes, including oversized responses', async () => {
  const cache = new RouteCache('build')
  const tags: (string | undefined)[] = []
  const fetcher = async (target: URL, _signal: AbortSignal, tag?: string) => {
    tags.push(tag)
    return response(body(target.pathname, target.pathname === '/large' ? '😀'.repeat(1_048_576) : 'ok'))
  }
  for (let i = 0; i < 33; i++) await cache.read(url(`/p${i}`), signal(), fetcher, () => 1, () => true)
  await cache.read(url('/p0'), signal(), fetcher, () => 1, () => true)
  await cache.read(url('/large'), signal(), fetcher, () => 1, () => true)
  await cache.read(url('/large'), signal(), fetcher, () => 1, () => true)
  expect(tags[33]).toBeUndefined()
  expect(tags.slice(-2)).toEqual([undefined, undefined])
})

it('discards an invalidated in-flight 304 and fetches again without a validator', async () => {
  const cache = new RouteCache('build')
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockResolvedValueOnce(response(body('/a', 'old')))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve }))
    .mockResolvedValueOnce(response(body('/a', 'new')))
  await cache.read(url('/a'), signal(), fetcher, () => 1, () => true)
  const pending = cache.read(url('/a'), signal(), fetcher, () => 2, () => true)
  cache.invalidate(['posts'])
  finish(notModified())
  const result = await pending
  expect(result.next.m[0]!.data).toBe('new')
  expect(result.since).toBe(2)
  expect(fetcher.mock.calls.map((args) => args[2])).toEqual([undefined, '"one"', undefined])
})

it('rejects uncacheable, unknown-build and session-cleared bodies', async () => {
  for (const extra of [{ 'cache-control': 'no-store' }, { vary: '*' }, { 'set-cookie': 'a=b' }]) {
    const cache = new RouteCache('build')
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(body('/a'), extra)))
    await cache.read(url('/a'), signal(), fetcher, () => 1, () => true)
    await cache.read(url('/a'), signal(), fetcher, () => 1, () => true)
    expect(fetcher.mock.calls.map((args) => args[2])).toEqual([undefined, undefined])
  }
  for (const build of [undefined, 'build']) {
    const cache = new RouteCache(build)
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(body('/a'))))
    await cache.read(url('/a'), signal(), fetcher, () => 1, () => true)
    cache.clear()
    await cache.read(url('/a'), signal(), fetcher, () => 1, () => true)
    expect(fetcher.mock.calls.map((args) => args[2])).toEqual([undefined, undefined])
  }
})

it('evicts least-recently-used bodies when their combined bytes exceed the limit', async () => {
  const cache = new RouteCache('build')
  const tags: (string | undefined)[] = []
  const fetcher = async (target: URL, _signal: AbortSignal, tag?: string) => {
    tags.push(tag)
    return response(body(target.pathname, 'x'.repeat(2_200_000)))
  }
  await cache.read(url('/a'), signal(), fetcher, () => 1, () => true)
  await cache.read(url('/b'), signal(), fetcher, () => 1, () => true)
  await cache.read(url('/a'), signal(), fetcher, () => 1, () => true)
  expect(tags).toEqual([undefined, undefined, undefined])
})

it('does not retain query seeds before the query cache can accept their generation', async () => {
  const cache = new RouteCache('build')
  const payload = JSON.stringify({ p: '/a', s: 200, m: [], c: [['q', null, 1, ['posts']]] })
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(payload)))
  await cache.read(url('/a'), signal(), fetcher, () => 1, () => false)
  await cache.read(url('/a'), signal(), fetcher, () => 2, () => true)
  expect(fetcher.mock.calls.map((args) => args[2])).toEqual([undefined, undefined])
})

it('drops validators on a build change', async () => {
  const cache = new RouteCache('old')
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response(body('/a'))))
  await cache.read(url('/a'), signal(), fetcher, () => 1, () => true)
  cache.setBuild('new')
  await cache.read(url('/a'), signal(), fetcher, () => 2, () => true)
  expect(fetcher.mock.calls.map((args) => args[2])).toEqual([undefined, undefined])
})

it('sends explicit validators and bypasses the browser HTTP cache', async () => {
  const { ask } = await import('../src/run/helpers')
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
  try {
    const ctrl = new AbortController()
    await ask(url('/a?x=1#part'), ctrl.signal, '"tag"')
    expect(fetcher).toHaveBeenCalledWith('/_weft/data/a?x=1', {
      cache: 'no-cache', signal: ctrl.signal,
      headers: { accept: 'application/json', 'if-none-match': '"tag"' },
    })
  } finally { fetcher.mockRestore() }
})

it('retains unrelated tags while validating their bodies again', async () => {
  const cache = new RouteCache('build')
  const fetcher = vi.fn().mockResolvedValueOnce(response(body('/a'))).mockResolvedValueOnce(notModified())
  await cache.read(url('/a'), signal(), fetcher, () => 1, () => true)
  cache.invalidate(['unrelated'])
  const result = await cache.read(url('/a'), signal(), fetcher, () => 2, () => true)
  expect(fetcher.mock.calls[1]![2]).toBe('"one"')
  expect(result.since).toBe(1)
})

it('refetches rather than reusing a 304 that forbids retention', async () => {
  const cache = new RouteCache('build')
  const fetcher = vi.fn().mockResolvedValueOnce(response(body('/a', 'old')))
    .mockResolvedValueOnce(new Response(null, { status: 304,
      headers: { ...headers, 'cache-control': 'no-store' } }))
    .mockResolvedValueOnce(response(body('/a', 'new')))
  await cache.read(url('/a'), signal(), fetcher, () => 1, () => true)
  const next = await cache.read(url('/a'), signal(), fetcher, () => 2, () => true)
  expect(next.next.m[0]!.data).toBe('new')
  expect(fetcher.mock.calls.map((args) => args[2])).toEqual([undefined, '"one"', undefined])
})

it('clears protected validators on authorization refusal', async () => {
  const cache = new RouteCache('build')
  const fetcher = vi.fn().mockResolvedValueOnce(response(body('/a')))
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(response(body('/a')))
  await cache.read(url('/a'), signal(), fetcher, () => 1, () => true)
  await expect(cache.read(url('/a'), signal(), fetcher, () => 2, () => true))
    .rejects.toThrow('Route authorization failed')
  await cache.read(url('/a'), signal(), fetcher, () => 3, () => true)
  expect(fetcher.mock.calls.map((args) => args[2])).toEqual([undefined, '"one"', undefined])
})
