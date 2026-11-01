// `server.extension` (extension.ts): the seam a plugin reaches the server through. This names no plugin on purpose.
import { describe, expect, test, vi } from 'vitest'
import { createHandler } from '../src/server'
import { createScope, fetchQuery } from '../src/exec'
import { fns, query } from '../src/data'
import type { ServerExtension } from '../src/extension'

const manifest = { routes: [], layouts: [] } as any

describe('a plugin on the server', () => {
  test('its routes are `/_weft/x/<key>/...`, loaded on first use, and it reports through the API', async () => {
    const report = vi.fn()
    const load = vi.fn(async (): Promise<ServerExtension> => ({ handle: (request, path, api) => { api.report({ code: 'X001', severity: 'warning', message: 'seen' }); return new Response(`${request.method} ${path}`) } }))
    const handler = createHandler({ manifest, modules: {}, dev: true, extensions: [{ key: 'kit', load }], onDiagnostic: report } as any)
    expect(load).not.toHaveBeenCalled()
    const res = await handler(new Request('http://x/_weft/x/kit/a/b', { method: 'POST' }))
    expect(await res.text()).toBe('POST a/b')
    expect(load).toHaveBeenCalledOnce()
    expect((await handler(new Request('http://x/_weft/x/other/a', { method: 'POST' }))).status).toBe(404)
  })

  test('it adds to `ctx`, after the app, and guards a call', async () => {
    query({ $id: 'x.q', run: ({ ctx }: any) => ctx.seen })
    const extensions: ServerExtension[] = [{ context: ctx => ({ seen: `by ${(ctx as any).user}` }), guard: f => { if (f.id === 'x.no') throw new Error('refused') } }]
    const scope = createScope(new Request('http://x/'), { context: () => ({ user: 'u1' }), extensions })
    expect((await fetchQuery(scope, fns.get('x.q')!, undefined)).v).toBe('by u1')
    query({ $id: 'x.no', run: () => 1 })
    await expect(fetchQuery(createScope(new Request('http://x/'), { extensions }), fns.get('x.no')!, undefined)).rejects.toThrow('refused')
  })

  test('`personal` keeps a key out of a shared cache', async () => {
    query({ $id: 'x.cached', cache: { life: '1m' }, run: ({ ctx }: any) => ctx.mine })
    const extensions: ServerExtension[] = [{ context: () => ({ mine: 1 }), personal: ['mine'] }]
    await expect(fetchQuery(createScope(new Request('http://x/'), { extensions }), fns.get('x.cached')!, undefined)).rejects.toMatchObject({ code: 'Q006' })
  })

  test('an error with an `answer` reaches the client as that answer', async () => {
    query({ $id: 'x.err', run: () => { throw Object.assign(new Error('nope'), { answer: { code: 'X002', message: 'nope', status: 402 } }) } })
    await expect(fetchQuery(createScope(new Request('http://x/'), {}), fns.get('x.err')!, undefined)).rejects.toMatchObject({ status: 402 })
  })

  test('a guard with an `answer` is that answer too', async () => {
    query({ $id: 'x.guarded', run: () => 1 })
    const extensions: ServerExtension[] = [{ guard: () => { throw Object.assign(new Error('no'), { answer: { code: 'X003', message: 'no', status: 403 } }) } }]
    await expect(fetchQuery(createScope(new Request('http://x/'), { extensions }), fns.get('x.guarded')!, undefined)).rejects.toMatchObject({ status: 403, code: 'X003' })
  })

  test('an option nothing enforces refuses the call, and an extension claims it', async () => {
    query({ $id: 'x.gated', requires: ['pro'], run: () => 1 } as any)
    await expect(fetchQuery(createScope(new Request('http://x/'), {}), fns.get('x.gated')!, undefined)).rejects.toMatchObject({ code: 'P101' })
    expect((await fetchQuery(createScope(new Request('http://x/'), { extensions: [{ options: ['requires'] }] }), fns.get('x.gated')!, undefined)).v).toBe(1)
  })

  test('`check` can refuse a boot', async () => {
    const handler = createHandler({ manifest, modules: {}, dev: false, extensions: [{ key: 'kit', load: async () => ({ check: () => { throw new Error('not configured') } }) }] } as any)
    await expect(handler(new Request('http://x/_weft/x/kit/a'))).rejects.toThrow('not configured')
  })
})
