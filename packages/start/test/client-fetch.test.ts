// `clientFetch`: an app's own sender for what the client runtime asks the server, server functions and route data
// alike. The default is `fetch` on the page's origin.
import { afterEach, expect, test, vi } from 'vitest'
import { clientFetch, type ClientFetch } from '../src/client-fetch'
import { http } from '../src/data/transport'
import { ask, deferred, revive } from '../src/run/helpers'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => {
  clientFetch(undefined)
  vi.unstubAllGlobals()
})

test('queries, mutations and route data go through the sender the app set, with what fetch would get', async () => {
  const sent: [string, RequestInit][] = []
  const send: ClientFetch = (path, init) => {
    sent.push([path, init])
    return Promise.resolve(
      json(
        path.startsWith('/_kerf/data')
          ? { m: [], p: '/explorer', s: 200 }
          : { v: 'ok', t: ['nodes'] },
      ),
    )
  }
  const page = vi.fn()
  vi.stubGlobal('fetch', page)
  clientFetch(send)

  expect(await http.query('nodes.list', { page: 2 })).toEqual({ v: 'ok', t: ['nodes'] })
  expect(await http.mutate('nodes.add', { name: 'a' }, [['nodes.list', undefined]])).toEqual({
    v: 'ok',
    t: ['nodes'],
  })
  const gone = new AbortController()
  const data = await ask(
    new URL('http://page.test/explorer/transactions?page=2'),
    gone.signal,
    'W/"1"',
  )
  expect(await data.json()).toEqual({ m: [], p: '/explorer', s: 200 })

  expect(page).not.toHaveBeenCalled()
  expect(sent.map(([path, init]) => [path, init.method])).toEqual([
    [`/_kerf/fn/nodes.list?i=${encodeURIComponent('{"page":2}')}`, 'GET'],
    ['/_kerf/fn/nodes.add', 'POST'],
    ['/_kerf/data/explorer/transactions?page=2', 'GET'],
  ])
  const [, mutate] = sent[1]!
  expect(mutate.headers).toMatchObject({ 'x-kerf': '1', 'content-type': 'application/json' })
  expect(JSON.parse(mutate.body as string)).toEqual({ i: { name: 'a' }, f: [['nodes.list', null]] })
  const [, route] = sent[2]!
  expect(route.signal).toBe(gone.signal)
  expect(route.headers).toMatchObject({ accept: 'application/json', 'if-none-match': 'W/"1"' })
})

test("a failure the app's sender answers with reaches the caller as the server's would", async () => {
  clientFetch(() => Promise.resolve(json({ e: { code: 'A002', message: 'Sign in first' } }, 401)))
  await expect(http.query('nodes.list', undefined)).rejects.toMatchObject({
    code: 'A002',
    status: 401,
  })
})

test('with no sender set, and after it is cleared, requests go to the page origin with fetch', async () => {
  const page = vi.fn((_path: string) => Promise.resolve(json({ v: 1 })))
  vi.stubGlobal('fetch', page)
  await http.query('nodes.list', undefined)
  clientFetch(() => Promise.resolve(json({ v: 2 })))
  expect(await http.query('nodes.list', undefined)).toEqual({ v: 2 })
  clientFetch(undefined)
  expect(await http.query('nodes.list', undefined)).toEqual({ v: 1 })
  await ask(new URL('http://page.test/'))
  expect(page.mock.calls.map(([path]) => path)).toEqual([
    '/_kerf/fn/nodes.list',
    '/_kerf/fn/nodes.list',
    '/_kerf/data',
  ])
})

test('a server function fault keeps its reference on the typed client error', async () => {
  const reference = '97b4e0ad7138fcd812219977'
  clientFetch(() =>
    Promise.resolve(
      Response.json(
        { e: { message: 'Server function failed.', reference } },
        { status: 500, headers: { 'x-kerf-error': reference } },
      ),
    ),
  )
  await expect(http.query('nodes.list', undefined)).rejects.toMatchObject({
    status: 500,
    reference,
    message: 'Server function failed.',
    stack: undefined,
  })
})

test('a rejected route field carries the server reference in both browser load paths', async () => {
  const reference = '1f09217d0e71bb7ae91552d1'
  const failure = { status: 500, reference, message: 'Something went wrong.' }
  const match = { id: '/', params: {}, d: ['late'], e: { late: failure }, data: {} }
  const download = new URL('http://page.test/')
  const oldLocation = globalThis.location
  vi.stubGlobal('location', download)
  clientFetch(() => Promise.resolve(json({ m: [match], p: '/', s: 200 })))
  try {
    await expect(Promise.resolve(deferred('/', 0, 'late'))).rejects.toMatchObject({ reference })
    const values = revive(match).data as Record<string, Promise<unknown>>
    await expect(values.late).rejects.toMatchObject({ reference })
  } finally {
    vi.stubGlobal('location', oldLocation)
  }
})
