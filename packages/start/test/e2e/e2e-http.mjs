// Run with scripts/runtime-matrix.mjs test/fixtures/endpoints --e2e test/e2e/e2e-http.mjs.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fnId } from '../../src/vite.mjs'

/** Exercise the same public HTTP behavior on each built runtime. */
export default async function run({ url }) {
  const checks = []
  const get = (path, init) => fetch(url + path, { redirect: 'manual', ...init })
  const origin = 'https://partner.example'
  const echo = await get('/api/echo/42', { method: 'POST', body: '{"ok":true}' })
  assert.deepEqual(await echo.json(), { id: '42', body: { ok: true }, hook: 'yes' })
  assert.deepEqual(await (await get('/r/a/b')).json(), { path: 'a/b' })
  const refused = await get('/api/echo/42', { method: 'DELETE' })
  assert.equal(refused.status, 405)
  assert.equal(refused.headers.get('allow'), 'POST')
  checks.push('JSON POST, server-only import, catch-all and Allow')

  const range = await get('/bytes', {
    headers: { range: 'bytes=2-4', 'accept-encoding': 'gzip, br' },
  })
  assert.equal(range.status, 206)
  assert.equal(range.headers.get('content-range'), 'bytes 2-4/10')
  assert.equal(range.headers.get('content-encoding'), null)
  assert.equal(range.headers.get('x-frame-options'), 'DENY')
  assert.equal(await range.text(), '234')
  const events = await get('/events', { headers: { 'accept-encoding': 'gzip, br' } })
  assert.equal(events.headers.get('content-encoding'), null)
  const reader = events.body.getReader()
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: first\n\n')
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: second\n\n')
  assert.equal((await reader.read()).done, true)
  checks.push('Range untouched and incremental SSE')

  assert.equal((await get('/hook-stop')).headers.get('location'), '/setup')
  const path = '/_kerf/fn/' + fnId('write', 'src/server/echo.ts')
  const headers = {
    origin,
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type,x-kerf,accept,x-agorix-grant',
  }
  const preflight = await get(path, { method: 'OPTIONS', headers })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
  assert.equal(
    (
      await get(path, {
        method: 'OPTIONS',
        headers: { ...headers, origin: 'https://refused.example' },
      })
    ).status,
    403,
  )
  const write = await get(path, {
    method: 'POST',
    body: '{}',
    headers: { origin, 'content-type': 'application/json', 'x-kerf': '1' },
  })
  assert.equal(write.status, 200)
  assert.equal(write.headers.get('access-control-allow-origin'), origin)
  await write.text()
  const query = await get('/_kerf/fn/' + fnId('read', 'src/server/echo.ts'), {
    headers: { origin },
  })
  assert.equal(query.status, 200)
  assert.equal(query.headers.get('access-control-allow-origin'), origin)
  await query.text()
  const data = await get('/_kerf/data/', { headers: { origin } })
  assert.equal(data.status, 200)
  assert.equal(data.headers.get('access-control-allow-origin'), origin)
  assert.ok(data.headers.get('server-timing'))
  await data.text()
  checks.push('hook, CORS preflight/read/write and refused origin')
  const root = new URL('../fixtures/endpoints/', import.meta.url)
  const contract = JSON.parse(readFileSync(new URL('.kerf/contract.json', root), 'utf8'))
  assert.ok(contract.http.some((r) => r.path === '/api/echo/[id]' && r.methods.includes('POST')))
  const publicDir = fileURLToPath(new URL('.output/public/', root))
  for (const file of readdirSync(publicDir, { recursive: true, withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith('.js')) continue
    const code = readFileSync(join(file.parentPath, file.name), 'utf8')
    assert.ok(!code.includes('x-endpoint-hook') && !code.includes('data: first'), file.name)
  }
  checks.push('contract route methods and server-only client bundle exclusion')
  return { checks }
}
