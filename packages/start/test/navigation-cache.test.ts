import { describe, expect, it } from 'vitest'
import { makeNavigation } from '../src/server/navigation'
import { validateNavigation } from '../src/server/navigation-cache'
import { selectRouteAssets } from '../src/asset-receipt.mjs'
import type { AssetReceipt } from '../src/router'

const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/page', { headers })

function response(body: string, headers: Record<string, string> = {}) {
  return new Response(body, { headers })
}

describe('route response validators', () => {
  it('changes the validator when the serialized cost-bearing payload changes', () => {
    const receipt: AssetReceipt = {
      build: 'build',
      version: 1,
      scope: 'vite-static-closure',
      files: { 'page.js': { bytes: 10, kind: 'js' } },
      routes: { page: { files: ['page.js'], bytes: 10 } },
      eager: null,
    }
    const firstBody = JSON.stringify({ a: selectRouteAssets(receipt, 'build', ['page']) })
    const first = validateNavigation(response(firstBody), request(), firstBody, 'build', 200)
    const tag = first.headers.get('etag')!
    receipt.files['page.js']!.bytes = 20
    const nextBody = JSON.stringify({ a: selectRouteAssets(receipt, 'build', ['page']) })
    const next = validateNavigation(
      response(nextBody),
      request({ 'if-none-match': tag }),
      nextBody,
      'build',
      200,
    )
    expect(next.status).toBe(200)
    expect(next.headers.get('etag')).not.toBe(tag)
  })
  it('returns a private 200 and an empty 304 for matching bytes and build', async () => {
    const first = validateNavigation(response('{}'), request(), '{}', 'one', 200)
    const tag = first.headers.get('etag')!
    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toBe('private, max-age=0, stale-while-revalidate=30')
    expect(first.headers.get('vary')).toBe('Accept, Cookie, Authorization')
    const second = validateNavigation(
      response('{}'),
      request({ 'if-none-match': tag }),
      '{}',
      'one',
      200,
    )
    expect(second.status).toBe(304)
    expect(await second.text()).toBe('')
    const newBuild = validateNavigation(
      response('{}'),
      request({ 'if-none-match': tag }),
      '{}',
      'two',
      200,
    )
    expect(newBuild.status).toBe(200)
  })

  it('preserves stricter directives and existing Vary', () => {
    const result = validateNavigation(
      response('{}', {
        'cache-control': 'public, must-revalidate',
        vary: 'Accept-Encoding, Cookie',
      }),
      request(),
      '{}',
      '',
      200,
    )
    expect(result.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate')
    expect(result.headers.get('vary')).toBe('Accept-Encoding, Cookie, Accept, Authorization')
  })

  it('preserves quoted directives and escapes at directive boundaries', () => {
    const policy = 'private="Set-Cookie, Authorization", example="a\\"b,c", must-revalidate'
    const result = validateNavigation(
      response('{}', { 'cache-control': policy }),
      request(),
      '{}',
      '',
      200,
    )
    expect(result.headers.get('cache-control')).toBe(`private, max-age=0, ${policy}`)
  })

  it('matches weak tags, lists and wildcard and preserves Vary star', () => {
    const first = validateNavigation(response('{}'), request(), '{}', 'one', 200)
    const tag = first.headers.get('etag')!
    for (const candidate of [`"other", W/${tag}`, '*']) {
      const result = validateNavigation(
        response('{}', { vary: '*' }),
        request({ 'if-none-match': candidate }),
        '{}',
        'one',
        200,
      )
      expect(result.status).toBe(304)
      expect(result.headers.get('vary')).toBe('*')
    }
  })

  it('does not retain no-store, cookie changes, or failed responses', () => {
    for (const [headers, status] of [
      [{ 'cache-control': 'no-store', etag: '"old"' }, 200],
      [{ 'set-cookie': 'session=new' }, 200],
      [{}, 403],
    ] as [Record<string, string>, number][]) {
      const result = validateNavigation(response('{}', headers), request(), '{}', '', status)
      expect(result.headers.get('cache-control')).toBe('no-store')
      expect(result.headers.has('etag')).toBe(false)
    }
  })

  it('runs authorization and loaders before comparing session and mutation results', async () => {
    let value = 1
    let calls = 0
    let mode = 'normal'
    // oxlint-disable-next-line typescript/require-await -- the mocked contract returns a Promise
    const resolve = async (_path: string, req: Request) => {
      calls++
      const session = req.headers.get('cookie')
      return {
        ...(mode === 'error' && { error: new Error('failed') }),
        ...(mode === 'redirect' && { redirect: { status: 302, href: '/login' } }),
        status: session ? 200 : 403,
        path: '/page',
        head: {},
        levels: [{ id: 'page', params: {}, data: { session, value }, raw: {} }],
      }
    }
    const receipt: AssetReceipt = {
      build: 'build',
      version: 1,
      scope: 'vite-static-closure',
      files: { 'page.js': { bytes: 10, kind: 'js' } },
      routes: { page: { files: ['page.js'], bytes: 10 } },
      eager: null,
    }
    const data = makeNavigation({
      resolve: resolve as unknown as Parameters<typeof makeNavigation>[0]['resolve'],
      // oxlint-disable-next-line typescript/require-await -- the mocked contract returns a Promise
      finished: async () => ({ title: '', og: {}, twitter: {}, extra: [] }),
      statics: new Set(),
      stateOf: () => {
        throw new Error('unexpected static render')
      },
      PASSES: 1,
      options: {
        build: 'build',
        routeAssetBytes: receipt,
        manifest: { dir: '', routes: [], layouts: [] },
        modules: {},
      },
    })
    const scope = () =>
      ({ headers: new Headers(), entries: new Map() }) as Parameters<typeof data>[2]
    const first = await data('/page', request({ cookie: 'session=a' }), scope())
    const tag = first.headers.get('etag')!
    expect((await first.json()).a.routeBytes).toBe(10)
    const same = await data(
      '/page',
      request({ cookie: 'session=a', 'if-none-match': tag }),
      scope(),
    )
    expect(same.status).toBe(304)
    receipt.files['page.js']!.bytes = 20
    const costChanged = await data(
      '/page',
      request({ cookie: 'session=a', 'if-none-match': tag }),
      scope(),
    )
    expect(costChanged.status).toBe(200)
    expect((await costChanged.json()).a.routeBytes).toBe(20)
    expect(costChanged.headers.get('etag')).not.toBe(tag)
    receipt.files['page.js']!.bytes = 10
    const other = await data(
      '/page',
      request({ cookie: 'session=b', 'if-none-match': tag }),
      scope(),
    )
    expect(other.status).toBe(200)
    const refused = await data('/page', request({ 'if-none-match': tag }), scope())
    expect(refused.headers.get('cache-control')).toBe('no-store')
    value++
    const changed = await data(
      '/page',
      request({ cookie: 'session=a', 'if-none-match': tag }),
      scope(),
    )
    expect(changed.status).toBe(200)
    expect(changed.headers.get('etag')).not.toBe(tag)
    for (const next of ['error', 'redirect']) {
      mode = next
      const result = await data(
        '/page',
        request({ cookie: 'session=a', 'if-none-match': tag }),
        scope(),
      )
      expect(result.status).toBe(200)
      expect(result.headers.get('cache-control')).toBe('no-store')
      expect(result.headers.has('etag')).toBe(false)
    }
    expect(calls).toBe(8)
  })
})
