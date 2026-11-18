import { expect, test, vi } from 'vitest'
import { createHandler } from '../src/server'
import type { HandlerOptions } from '../src/server/types'
import { channel, FnError, query, raise, StartError, stream } from '../src/index'
import { fns } from '../src/data'
import { createScope } from '../src/exec'
import { attach } from '../src/socket'
import { hub, rtRoute, type Body } from '../src/hub'

const privateText = 'private connection marker'
const request = (path: string, init?: RequestInit) => new Request('http://kerf.test' + path, init)
const manifest = { dir: 'src/routes', layouts: [], routes: [] }
const reporter = () => vi.fn<NonNullable<HandlerOptions['onDiagnostic']>>()

function correlate(report: ReturnType<typeof reporter>, code: string, ref: string) {
  expect(ref).toMatch(/^[0-9a-f]{24}$/)
  expect(report.mock.calls.filter(([d]) => d.reference === ref)).toEqual([
    [
      expect.objectContaining({
        code,
        reference: ref,
        message: expect.stringContaining(privateText),
      }),
    ],
  ])
}

test('raw throws return a correlated JSON failure with HEAD and immutable Response compatibility', async () => {
  const report = reporter()
  const handler = createHandler({
    manifest: {
      ...manifest,
      http: [{ path: '/api', pattern: '/api', params: [], file: 'api', methods: ['GET'] }],
    },
    modules: {},
    httpModules: {
      api: {
        GET: () => {
          throw new Error(privateText)
        },
      },
    },
    onDiagnostic: report,
    handle: (incoming, next) =>
      new URL(incoming.url).pathname === '/owned'
        ? Response.redirect('http://kerf.test/target', 302)
        : next(incoming),
  })
  const failed = await handler(request('/api'))
  const { e } = await failed.json()
  expect(failed.status).toBe(500)
  expect(failed.headers.get('cache-control')).toBe('no-store')
  expect(failed.headers.get('x-kerf-error')).toBe(e.ref)
  expect(e).toEqual({
    code: 'E_REQUEST',
    status: 500,
    message: 'Something went wrong.',
    ref: e.ref,
    reference: e.ref,
  })
  correlate(report, 'E_REQUEST', e.ref)
  const head = await handler(request('/api', { method: 'HEAD' }))
  expect(head.status).toBe(500)
  expect(head.body).toBeNull()
  const owned = await handler(request('/owned'))
  expect(owned.headers.get('location')).toBe('http://kerf.test/target')
  expect(owned.headers.get('x-request-id')).toBeTruthy()
})

test('hook throws share the original request ID and get their own reference', async () => {
  const report = reporter()
  const handler = createHandler({
    manifest,
    modules: {},
    site: { trustProxy: true },
    onDiagnostic: report,
    handle: () => {
      throw new StartError('Q014', privateText)
    },
  })
  const response = await handler(request('/', { headers: { 'x-request-id': 'proxy-72' } }))
  const { e } = await response.json()
  expect(response.headers.get('x-request-id')).toBe('proxy-72')
  expect(e.code).toBe('E_REQUEST')
  correlate(report, 'E_REQUEST', e.ref)
  expect(report.mock.calls[0]?.[0].requestId).toBe('proxy-72')
})

test('liveness stays available after an embedded extension rejects its startup check', async () => {
  const check = vi.fn().mockRejectedValue(new Error(privateText))
  const report = reporter()
  const handler = createHandler({
    manifest,
    modules: {},
    onDiagnostic: report,
    extensions: [{ key: 'rejecting', load: () => Promise.resolve({ check }) }],
  })
  expect(await (await handler(request('/_kerf/health'))).json()).toEqual({ ok: true })
  expect(check).not.toHaveBeenCalled()
  const ready = await handler(request('/_kerf/ready'))
  expect(ready.status).toBe(503)
  correlate(report, 'E_STARTUP', (await ready.json()).e.ref)
  expect((await handler(request('/'))).status).toBe(503)
  expect((await handler(request('/_kerf/health'))).status).toBe(200)
  expect(check).toHaveBeenCalledOnce()
})

test('validation copy is safe and declared error data passes through its schema', async () => {
  const schema = {
    '~standard': {
      version: 1 as const,
      vendor: 'fixture',
      validate: () => ({ issues: [{ message: privateText, path: ['name'] }] }),
    },
  }
  const input = query({ $id: 'public.input', input: schema, run: () => null })
  const declared = query({
    $id: 'public.declared',
    errors: {
      Conflict: {
        '~standard': {
          version: 1 as const,
          vendor: 'fixture',
          validate: () => ({ value: { reason: 'approved' } }),
        },
      },
    },
    run: () => raise('Conflict', { detail: privateText }),
  })
  const report = reporter()
  const handler = createHandler({ manifest, modules: {}, onDiagnostic: report })
  try {
    const rejected = await handler(request('/_kerf/fn/public.input?i=1'))
    expect(await rejected.json()).toEqual({
      e: {
        code: 'Q002',
        status: 400,
        message: 'Invalid request.',
        issues: [{ path: ['name'], message: 'Invalid value.' }],
      },
    })
    const domain = await handler(request('/_kerf/fn/public.declared'))
    expect(await domain.json()).toEqual({
      e: {
        code: 'Conflict',
        status: 400,
        message: 'Invalid request.',
        data: { reason: 'approved' },
      },
    })
    expect(report).not.toHaveBeenCalled()
  } finally {
    for (const fn of [input, declared]) fns.delete(fn.$id)
  }
})

test('SSE reports private failures with the same reference in its existing error frame', async () => {
  const report = reporter()
  const fn = stream({
    $id: 'public.stream',
    async *run() {
      await Promise.resolve()
      if (privateText) throw new StartError('Q016', privateText, undefined, { status: 503 })
      yield 1
    },
  })
  const body: Body = { s: [[1, 's', fn.$id]] }
  const incoming = request('/_kerf/rt', {
    method: 'POST',
    headers: { 'x-kerf': '1', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const response = await rtRoute(incoming, createScope(incoming, { onDiagnostic: report }))
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  try {
    let text = ''
    while (!text.includes('event: e')) {
      const { done, value } = await reader.read()
      if (done) throw new Error('The stream closed before its failure frame')
      text += decoder.decode(value)
    }
    const data = JSON.parse(/event: e\ndata: (.+)/.exec(text)![1]!)
    expect(text).not.toContain(privateText)
    expect(data).toEqual([
      1,
      {
        code: 'Q016',
        status: 503,
        message: 'Realtime operation failed.',
        ref: data[1].ref,
        reference: data[1].ref,
      },
    ])
    correlate(report, 'Q016', data[1].ref)
  } finally {
    await reader.cancel()
    fns.delete(fn.$id)
  }
})

test('channel acknowledgements preserve status and correlate a thrown FnError', async () => {
  const report = reporter()
  const fn = channel({
    $id: 'public.channel',
    authorize: () => true,
    client: {
      send: {
        '~standard': {
          version: 1 as const,
          vendor: 'fixture',
          validate: () => ({ value: null }),
        },
      },
    },
    on: {
      send() {
        throw new FnError({ code: 'upstream', message: privateText }, 502)
      },
    },
  })
  const incoming = request('/_kerf/ws')
  const send = vi.fn<(text: string) => void>()
  const peer = await attach(
    { send, close: () => {}, backlog: () => 0 },
    incoming,
    createScope(incoming, { onDiagnostic: report }),
    hub(),
  )
  try {
    peer.message(JSON.stringify(['j', 1, fn.$id]))
    await vi.waitFor(() =>
      expect(send.mock.calls.some(([line]) => line.startsWith('["j",'))).toBe(true),
    )
    peer.message(JSON.stringify(['m', 1, 7, 'send', null]))
    const ack = await vi.waitFor(() => {
      const line = send.mock.calls.find(([frame]) => frame.startsWith('["a",'))?.[0]
      expect(line).toBeDefined()
      expect(line).not.toContain(privateText)
      return JSON.parse(line!)
    })
    expect(ack).toEqual([
      'a',
      1,
      7,
      {
        code: 'upstream',
        status: 502,
        message: 'Realtime operation failed.',
        ref: ack[3].ref,
        reference: ack[3].ref,
      },
    ])
    correlate(report, 'upstream', ack[3].ref)
  } finally {
    peer.close()
    fns.delete(fn.$id)
  }
})
