import { beforeEach, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { clientFetch } from '../src/client-fetch'
import { defineBootstrap } from '../src/shell/bootstrap'
import { markShellClient } from '../src/shell/client-policy'
import { admitOperation } from '../src/shell/client-operations'
import { query } from '../src/data/definitions'
import { ShellDataError, shellResponse, wireFrame } from '../src/shell/operation'
import { admitChannel, admitSse } from '../src/shell/realtime'
import { socketFrame, sseFrame } from '../src/shell/realtime-server'
import { redirectPath, routeReturnTo, setReturnRoutes } from '../src/shell/routes'
import { SHELL_MEDIA } from '../src/shell/wire'
import { routeRedirect } from '../src/shell'
import type { Fn } from '../src/data/types'

const build = 'release'
const schema = z.strictObject({ value: z.number().int().min(0).max(9) })
const sample = { value: 1 }
const operation = query({ $id: 'counter', output: schema, run: () => sample })
const kind = 'fn:counter'
const result = { v: sample, t: ['counter'] }

beforeEach(() => {
  markShellClient(build)
  return () => {
    clientFetch(undefined)
    vi.unstubAllGlobals()
  }
})

test('binds an operation body to the requested release and local schema', async () => {
  await expect(admitOperation(operation, shellResponse(build, kind, result))).resolves.toEqual(
    sample,
  )
  for (const response of [
    shellResponse('old', kind, result),
    shellResponse(build, 'fn:other', result),
    shellResponse(build, kind, { ...result, c: [] }),
    shellResponse(build, kind, { ...result, v: { ...sample, extra: true } }),
    shellResponse(build, kind, { ...result, v: { value: 10 } }),
    shellResponse(build, kind, { ...result, t: ['tag\n'] }),
    new Response('plain reply'),
    new Response('{}\n'.repeat(2), { headers: { 'content-type': SHELL_MEDIA } }),
  ]) {
    await expect(admitOperation(operation, response)).rejects.toMatchObject({
      name: 'ShellDataError',
      code: 'invalid',
      status: 502,
    })
  }
})

test('reduces peer errors to local codes and rejects mismatched or embellished failures', async () => {
  const failure = shellResponse(build, kind, { code: 'forbidden' }, 403)
  await expect(admitOperation(operation, failure)).rejects.toEqual(new ShellDataError('forbidden'))
  for (const [body, status] of [
    [{ code: 'forbidden' }, 404],
    [{ code: 'peer_error' }, 403],
    [{ code: 'forbidden', message: 'Peer detail' }, 403],
  ] as const) {
    await expect(
      admitOperation(operation, shellResponse(build, kind, body, status)),
    ).rejects.toMatchObject({
      code: 'invalid',
      message: 'Invalid shell data.',
    })
  }
})

test('bootstrap dedupes concurrent reads and clears the previous value on a refused refresh', async () => {
  const bootstrap = defineBootstrap(schema)
  expect(() => bootstrap.read()).toThrow(ShellDataError)
  const fetch = vi.fn(() => Promise.resolve(shellResponse(build, 'bootstrap', sample)))
  clientFetch(fetch)
  const first = bootstrap.refresh()
  expect(bootstrap.refresh()).toBe(first)
  await expect(first).resolves.toEqual(sample)
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledWith(
    '/_kerf/bootstrap',
    expect.objectContaining({
      redirect: 'error',
      credentials: 'omit',
      signal: expect.any(AbortSignal),
    }),
  )
  expect(bootstrap.read()).toEqual(sample)
  fetch.mockResolvedValueOnce(shellResponse('old', 'bootstrap', { value: 2 }))
  await expect(bootstrap.refresh()).rejects.toMatchObject({ code: 'invalid' })
  expect(() => bootstrap.read()).toThrow(ShellDataError)
  fetch.mockResolvedValueOnce(shellResponse(build, 'bootstrap', { value: 3 }))
  await expect(bootstrap.refresh()).resolves.toEqual({ value: 3 })
  expect(bootstrap.read()).toEqual({ value: 3 })
})

const find = (n: number): Fn | undefined =>
  [
    { $id: 'feed', kind: 'stream', def: { message: schema } } satisfies Fn,
    { $id: 'room', kind: 'channel', def: { server: { notice: schema } } } satisfies Fn,
    { $id: 'shared', kind: 'shared', def: { value: schema } } satisfies Fn,
  ][n - 1]

test('SSE checks the event name, build, row, and its local subscription schema', async () => {
  const frame = (value: unknown) => JSON.stringify(wireFrame(build, 'sse:m', value))
  await expect(admitSse('m', frame([1, null, sample]), build, find)).resolves.toEqual([
    1,
    null,
    sample,
  ])
  await expect(admitSse('m', frame([4, null, sample]), build, find)).resolves.toBeUndefined()
  for (const [event, data, release] of [
    ['r', frame([1]), build],
    ['m', frame([1, null, sample]), 'different'],
    ['m', frame([2, null, sample]), build],
    ['m', frame([1, null, { ...sample, extra: true }]), build],
    ['m', frame([1, null, sample, null]), build],
  ] as const) {
    await expect(admitSse(event, data, release, find)).rejects.toMatchObject({ code: 'invalid' })
  }
})

test('channels admit only declared server messages and shared-state values', async () => {
  const frame = (value: unknown) => JSON.stringify(wireFrame(build, 'channel', value))
  const call = (value: unknown) => admitChannel(frame(value), build, find)
  await expect(call(['m', 2, 'cursor', 'notice', sample])).resolves.toEqual([
    'm',
    2,
    'cursor',
    'notice',
    sample,
  ])
  await expect(call(['m', 3, 'cursor', '$v', { v: sample, at: 1, o: 'epoch' }])).resolves.toEqual([
    'm',
    3,
    'cursor',
    '$v',
    { v: sample, at: 0 },
  ])
  for (const row of [
    ['m', 2, 'cursor', 'other', sample],
    ['m', 2, 'cursor', 'notice', { value: 100 }],
    ['m', 2, 'cursor', 'notice', sample, false],
    ['m', 3, 'cursor', '$v', { v: sample, at: 1, o: 'epoch', extra: true }],
    ['a', 2, 3, { code: 'forbidden', message: 'Peer detail' }],
  ]) {
    await expect(call(row)).rejects.toMatchObject({ code: 'invalid' })
  }
})

test('peer realtime framing replaces all diagnostic detail with a closed code', async () => {
  const failure = { code: 'A002', status: 401, message: 'Peer detail', data: sample }
  const event = sseFrame(build, 'e', JSON.stringify([1, failure]))!
  const ack = socketFrame(build, JSON.stringify(['a', 2, 3, failure]))!
  expect(event + ack).not.toContain('Peer detail')
  await expect(admitSse('e', event, build, find)).resolves.toEqual([
    1,
    new ShellDataError('unauthorized'),
  ])
  await expect(admitChannel(ack, build, find)).resolves.toEqual([
    'a',
    2,
    3,
    new ShellDataError('unauthorized'),
  ])
  expect(
    socketFrame(build, JSON.stringify(['m', 2, 'cursor', 'notice', 'π'.repeat(40_000)])),
  ).toBeUndefined()
})

const redirects = {
  site: {
    routeRedirects: {
      item: { path: '/item/:outpoint', params: { outpoint: '[a-f0-9]+:[0-9]+' }, returnTo: 'next' },
      home: '/',
      absent: '/absent',
    },
  },
  table: [
    { id: 'home', pattern: '/', layouts: [] },
    { id: 'item', pattern: '/item/$outpoint', layouts: [] },
  ],
} as const

test('redirects encode validated segments and append only a browser-owned return path', () => {
  const redirect = routeRedirect<typeof redirects.site.routeRedirects>('item', {
    outpoint: 'a42:0',
  })
  const current = new URL('https://release.invalid/?tab=one#anchor')
  expect(redirectPath(redirects, redirect.id, redirect.params, current)).toBe(
    '/item/a42%3A0?next=%2F%3Ftab%3Done',
  )
  expect(redirectPath(redirects, 'home', undefined)).toBe('/')
  expect(redirectPath(redirects, 'absent', undefined)).toBeUndefined()
  expect(redirectPath(redirects, 'constructor', undefined)).toBeUndefined()
  for (const params of [
    undefined,
    { outpoint: '../outside' },
    { outpoint: '%2F' },
    { outpoint: 'a:0', next: '/' },
    { outpoint: 'a'.repeat(300) + ':0' },
  ])
    expect(redirectPath(redirects, 'item', params)).toBeUndefined()
})

test('routeReturnTo refuses off-origin, unlisted or repeated destinations', () => {
  setReturnRoutes(redirects)
  const path = (next: string) => {
    vi.stubGlobal('location', new URL('https://release.invalid/item/a:0?next=' + next))
    return routeReturnTo('next')
  }
  expect(path('%2F%3Ftab%3Done')).toBe('/?tab=one')
  expect(path('%2Funlisted')).toBeUndefined()
  expect(path('https%3A%2F%2Foutside.invalid%2F')).toBeUndefined()
  expect(path('%2F&next=%2F')).toBeUndefined()
})

test('typed redirect tables require the right id and named segments', () => {
  type Redirects = typeof redirects.site.routeRedirects
  // @ts-expect-error The release table has no matching id.
  expect(routeRedirect<Redirects>('elsewhere').id).toBe('elsewhere')
  // @ts-expect-error The item path needs a named parameter.
  expect(routeRedirect<Redirects>('item').params).toBeUndefined()
  // @ts-expect-error The item path needs outpoint.
  expect(routeRedirect<Redirects>('item', { id: '42' }).params).toEqual({ id: '42' })
})

test('an uncontracted runtime registration cannot dispatch a browser query or admit its body', async () => {
  const missing = query({ $id: 'pluginQuery', run: () => sample })
  const send = vi.fn(() => Promise.resolve(shellResponse(build, 'fn:pluginQuery', result)))
  clientFetch(send)
  await expect(missing.fetch()).rejects.toMatchObject({ code: 'invalid' })
  await expect(
    admitOperation(missing, shellResponse(build, 'fn:pluginQuery', result)),
  ).rejects.toMatchObject({ code: 'invalid' })
  expect(send).not.toHaveBeenCalled()
})

test('a canceled raw operation cannot deliver a late asynchronous validation', async () => {
  let resolveValue: (result: { value: typeof sample }) => void = () => {}
  let validating: () => void = () => {}
  const entered = new Promise<void>((resolve) => {
    validating = resolve
  })
  const delayed = query({
    $id: 'delayed',
    run: () => sample,
    output: {
      '~standard': {
        version: 1,
        vendor: 'critic',
        validate: () => {
          validating()
          return new Promise((resolve) => {
            resolveValue = resolve
          })
        },
      },
    },
  })
  const controller = new AbortController()
  const value = admitOperation(delayed, shellResponse(build, 'fn:delayed', result), {
    signal: controller.signal,
  })
  const settled = value.catch((error: unknown) => error)
  await entered
  controller.abort()
  await expect(settled).resolves.toMatchObject({ code: 'invalid' })
  resolveValue({ value: sample })
})

test('service clocks apply typed shared values in delivery order and discard peer time', async () => {
  const read = (at: number) =>
    admitChannel(
      JSON.stringify(
        wireFrame(build, 'channel', ['m', 3, 'cursor', '$v', { v: sample, at, o: 'epoch' }]),
      ),
      build,
      find,
    )
  await expect(read(Number.MAX_SAFE_INTEGER)).resolves.toEqual([
    'm',
    3,
    'cursor',
    '$v',
    { v: sample, at: 0 },
  ])
  await expect(read(1)).resolves.toEqual(['m', 3, 'cursor', '$v', { v: sample, at: 0 }])
})
