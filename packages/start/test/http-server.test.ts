import { inject } from 'vitest'
import { fnId } from '../src/vite.mjs'

const url = inject('url')
const get = (path: string, init?: RequestInit) => fetch(url + path, { redirect: 'manual', ...init })
const origin = 'https://partner.example'

test('HTTP modules receive JSON, raw multipart and catch-all params through kerf dev', async () => {
  const post = await get('/api/echo/42', {
    method: 'POST',
    body: '{"ok":true}',
    headers: { origin: 'https://untrusted.example' },
  })
  expect(await post.json()).toEqual({ id: '42', body: { ok: true }, hook: 'yes' })
  expect(await (await get('/r/a/b%20c')).json()).toEqual({ path: 'a/b c' })
  expect((await get('/r')).status).toBe(404)
  expect(await (await get('/optional')).json()).toEqual({ path: '' })
  expect(await (await get('/optional/a/b')).json()).toEqual({ path: 'a/b' })
  expect(await (await get('/.well-known/agent')).json()).toEqual({ agent: true })
  const body = '--raw\r\nContent-Disposition: form-data; name="x"\r\n\r\nvalue\r\n--raw--\r\n'
  expect(
    await (
      await get('/about', {
        method: 'POST',
        body,
        headers: { 'content-type': 'multipart/form-data; boundary=raw' },
      })
    ).text(),
  ).toBe(body)
  expect((await get('/about')).status).toBe(200)
  const refused = await get('/api/echo/42', { method: 'DELETE' })
  expect(refused.status).toBe(405)
  expect(refused.headers.get('allow')).toBe('POST')
})

test('SSE delivers its first chunk before its second chunk exists, without compression', async () => {
  const response = await get('/events', { headers: { 'accept-encoding': 'gzip, br' } })
  expect(response.headers.get('content-encoding')).toBeNull()
  expect(response.headers.get('cache-control')).toBe('no-cache')
  const reader = response.body!.getReader()
  const first = await reader.read()
  expect(new TextDecoder().decode(first.value)).toBe('data: first\n\n')
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: second\n\n')
  expect((await reader.read()).done).toBe(true)
})

test('Range bytes and their representation and security headers remain intact', async () => {
  const response = await get('/bytes', {
    headers: { range: 'bytes=2-4', 'accept-encoding': 'gzip, br' },
  })
  expect(response.status).toBe(206)
  expect(Object.fromEntries(response.headers)).toMatchObject({
    'content-range': 'bytes 2-4/10',
    'content-length': '3',
    'cache-control': 'public, max-age=42',
    'x-frame-options': 'DENY',
  })
  expect(response.headers.get('content-encoding')).toBeNull()
  expect(await response.text()).toBe('234')
  const head = await get('/bytes', { method: 'HEAD' })
  expect(head.status).toBe(200)
  expect(await head.text()).toBe('')
})

test('the request hook short-circuits and wraps real server responses', async () => {
  const stop = await get('/hook-stop')
  expect(stop.status).toBe(307)
  expect(stop.headers.get('location')).toBe('/setup')
  expect((await get('/.well-known/agent')).headers.get('server-timing')).toBe('hook;dur=1')
})

test('Kerf CORS accepts named origins and headers, refuses the rest and decorates query/data responses', async () => {
  const path = '/_kerf/fn/' + fnId('addTodo', 'src/server/todos.ts')
  const preflight = (headers: Record<string, string> = {}) =>
    get(path, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, X-Kerf, accept, X-Agorix-Grant',
        ...headers,
      },
    })
  const allowed = await preflight()
  expect(allowed.status).toBe(204)
  expect(allowed.headers.get('access-control-allow-origin')).toBe(origin)
  expect(allowed.headers.get('access-control-allow-credentials')).toBe('true')
  expect(allowed.headers.get('vary')).toContain('Origin')
  expect((await preflight({ origin: 'https://refused.example' })).status).toBe(403)
  expect((await preflight({ 'access-control-request-headers': 'x-not-listed' })).status).toBe(403)
  expect((await preflight({ 'access-control-request-method': 'DELETE' })).status).toBe(403)
  const query = await get('/_kerf/fn/' + fnId('listTodos', 'src/server/todos.ts'), {
    headers: { origin },
  })
  expect(query.status).toBe(200)
  expect(query.headers.get('access-control-allow-origin')).toBe(origin)
  await query.text()
  const data = await get('/_kerf/data/about', { headers: { origin } })
  expect(data.status).toBe(200)
  expect(data.headers.get('access-control-allow-origin')).toBe(origin)
  await data.text()
  const own = await get('/.well-known/agent', { headers: { origin } })
  expect(own.headers.get('access-control-allow-origin')).toBeNull()
})
