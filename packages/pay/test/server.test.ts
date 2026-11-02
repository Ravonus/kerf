// The ledger on a real database, and `/_weft/x/pay/<rail>` on the real handler: verification before anything is read,
// tags on to the hub, and an app with no `src/pay.server.ts` that has no such route at all.
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { createHmac } from 'node:crypto'
import { product, PayError, type PayRail } from '@weft-js/pay'
import { definePay, extension, memoryPayStore } from '@weft-js/pay/server'
import { drizzlePayStore } from '@weft-js/pay/drizzle'
import { runtime } from '@weft-js/start/data'
import { createDb } from '@weft-js/start/db/sqlite'
import { createHandler } from '@weft-js/start/server'

const pro = product({ id: 'pro', kind: 'subscription', use: 'digital', plans: { month: { usd: 999 } }, grants: ['pro'] })
const urls = { success: '/', cancel: '/' }

describe('drizzlePayStore', () => {
  const purchases = sqliteTable('purchases', { id: text().primaryKey(), rail: text().notNull(), user: text(), product: text(), plan: text(), state: text().notNull(), at: integer().notNull(), expires: integer(), customer: text() })
  const payEvents = sqliteTable('pay_events', { id: text().primaryKey(), at: integer().notNull() })
  const init = [{ tag: '0000_pay', sql: 'create table purchases (id text primary key, rail text not null, user text, product text, plan text, state text not null, at integer not null, expires integer, customer text);\n--> statement-breakpoint\ncreate table pay_events (id text primary key, at integer not null);' }]

  test('holds the ledger, and a replay changes nothing', async () => {
    const db = createDb({ schema: { purchases, payEvents }, url: ':memory:', migrate: false })
    await db.$weft.migrate(init)
    const pay = definePay({ catalog: [pro], store: drizzlePayStore(db, { purchases, payEvents }), urls })
    const event = { id: 'e1', at: 1000, purchase: 'sub_1', state: 'active', user: 'u1', product: 'pro', plan: 'month', customer: 'c1' } as const
    expect(await pay.ingest('r', [event])).toEqual(['entitlements:u1'])
    expect(await pay.entitlements('u1').list()).toEqual(['pro'])
    await pay.ingest('r', [{ id: 'e2', at: 2000, purchase: 'sub_1', state: 'refunded' }])
    expect(await pay.ingest('r', [{ ...event, at: 3000 }])).toEqual([])
    expect(await pay.purchases('u1')).toEqual([{ id: 'r:sub_1', rail: 'r', user: 'u1', product: 'pro', plan: 'month', state: 'refunded', at: 2000, expires: null, customer: 'c1' }])
    expect(db.$weft.exempt.has('pay_events')).toBe(true)
  })
})

describe('/_weft/x/pay/<rail>, through `server.extension`', () => {
  const secret = 'placeholder'
  const hook = (body: string, key = secret) => ({ 'x-sig': createHmac('sha256', key).update(body).digest('hex') })
  const rail: PayRail = {
    id: 'test',
    checkout: () => Promise.resolve({ url: 'http://x/' }),
    portal: () => Promise.resolve({ url: 'http://x/' }),
    verify({ body, headers }) {
      if (headers.get('x-sig') !== hook(body)['x-sig']) throw new PayError('PAY011', 'bad')
      return JSON.parse(body)
    },
  }
  const manifest = { dir: '', routes: [], layouts: [] }
  const app = () => {
    const pay = definePay({ catalog: [pro], store: memoryPayStore(), urls, slot: () => Promise.resolve({ load: () => Promise.resolve(rail), providers: { test: '@acme/rail' } }) })
    const diagnostics: { code: string; message: string }[] = []
    return { pay, diagnostics, handler: createHandler({ manifest, modules: {}, extensions: [{ key: 'pay', load: () => Promise.resolve(extension(pay)) }], dev: true, onDiagnostic: d => diagnostics.push(d) }) }
  }
  const post = (path: string, body: string, headers: Record<string, string>) => new Request(`http://localhost${path}`, { method: 'POST', body, headers })
  const body = JSON.stringify([{ id: 'e1', at: 1000, purchase: 'p1', state: 'active', user: 'u1', product: 'pro' }])

  test('verifies, applies and pokes the user\'s tag', async () => {
    const { pay, handler } = app()
    const poke = runtime.poke!
    const poked: string[][] = []
    runtime.poke = tags => { poked.push(tags); return Promise.resolve() }
    const res = await handler(post('/_weft/x/pay/test', body, hook(body)))
    runtime.poke = poke
    expect(res.status).toBe(200)
    expect(poked).toEqual([['entitlements:u1']])
    expect(await pay.entitlements('u1').has('pro')).toBe(true)
  })

  test('a bad signature is a 400 that says nothing, and the reason goes to the log', async () => {
    const { pay, handler, diagnostics } = app()
    const res = await handler(post('/_weft/x/pay/test', body, hook(body, 'another')))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Bad signature')
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'PAY011' })])
    expect(await pay.entitlements('u1').has('pro')).toBe(false)
  })

  test('an unknown rail is a 404, a GET a 405, and a huge body a 413', async () => {
    const { handler } = app()
    expect((await handler(post('/_weft/x/pay/nope', body, hook(body)))).status).toBe(404)
    expect((await handler(new Request('http://localhost/_weft/x/pay/test'))).status).toBe(405)
    const big = 'x'.repeat((1 << 20) + 1)
    expect((await handler(post('/_weft/x/pay/test', big, hook(big)))).status).toBe(413)
  })

  test('with no `src/pay.server.ts` the path is nothing', async () => {
    const handler = createHandler({ manifest, modules: {}, dev: true })
    expect((await handler(post('/_weft/x/pay/test', body, hook(body)))).status).toBe(404)
  })
})
