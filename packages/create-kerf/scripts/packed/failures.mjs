import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Give the native and WASM packed apps the same failing raw endpoint. */
export function failureFixture(app) {
  writeFileSync(
    join(app, 'src/routes/kerf-packed-fault.http.ts'),
    "export function GET(): Response { throw new Error('packed private fixture detail') }\n",
  )
}

/** Prove the installed build ships its startup and production response adapters. */
export async function failureServed(port, log) {
  const base = `http://localhost:${port}`
  const live = await fetch(base + '/_kerf/health')
  assert.equal(live.status, 200)
  assert.deepEqual(await live.json(), { ok: true })
  const ready = await fetch(base + '/_kerf/ready')
  assert.equal(ready.status, 200)
  assert.equal((await ready.json()).ok, true)
  const raw = await fetch(base + '/kerf-packed-fault')
  const ref = raw.headers.get('x-kerf-error')
  assert.match(ref ?? '', /^[a-f0-9]{24}$/)
  assert.equal(raw.status, 500)
  assert.deepEqual(await raw.json(), {
    e: { code: 'E_REQUEST', status: 500, message: 'Something went wrong.', ref, reference: ref },
  })
  log('liveness, readiness and correlated raw failure: pass')
}
