// The PAY-codes (research 10 §7, 37): each fires on the mistake and stays quiet on the fix.
import { describe, expect, it } from 'vitest'
import { check } from '../src/check.mjs'
import { entry } from '../src/catalog.mjs'
import { fix } from '../src/fix.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { project } from './helpers.mjs'

const codes = (r, prefix = /^(PAY|T030)/) => r.diagnostics.filter(d => prefix.test(d.code)).map(d => d.code)
const run = async files => check(project(files))
const server = "import pay from '../pay.server'\n"

describe('PAY003: keys', () => {
  const key = ['sk', 'live', 'abcdefghijkl'].join('_')
  it('a key in the source, in any file', async () => {
    expect(codes(await run({ 'src/server/stripe.ts': `export const k = '${key}'\n` }))).toEqual(['PAY003'])
  })
  it('a server secret read in client code, and only there', async () => {
    expect(codes(await run({ 'src/routes/index.tsx': 'export default () => <p>{process.env.STRIPE_SECRET_KEY}</p>\n' }))).toEqual(['PAY003'])
    expect(codes(await run({ 'src/server/x.ts': 'export const k = process.env.STRIPE_SECRET_KEY\n' }))).toEqual([])
  })
  it('a key in plugin options', async () => {
    expect(codes(await run({ 'weft.config.ts': 'const stripe = (o: object) => ({ name: "x" })\nexport default { plugins: [stripe({ secretKey: process.env.K })] }\n' }))).toContain('PAY003')
  })
  it('an obvious placeholder is not a key', async () => {
    expect(codes(await run({ 'src/server/x.ts': "export const k = 'sk_test_placeholder'\n" }))).toEqual([])
  })
})

describe('PAY012: rail ids', () => {
  it('a price id in client code', async () => {
    const r = await run({ 'src/routes/index.tsx': "export default () => <button data-price=\"x\" onClick={() => go('price_1AbCdEfGhIjK')}>Buy</button>\n" })
    expect(codes(r)).toEqual(['PAY012'])
    expect(r.diagnostics.find(d => d.code === 'PAY012').fix.text).toContain('checkout')
  })
  it('a price id on the server is its own business', async () => {
    expect(codes(await run({ 'src/server/x.ts': "export const id = 'price_1AbCdEfGhIjK'\n" }))).toEqual([])
  })
  it('the word in a string is not an id', async () => {
    expect(codes(await run({ 'src/routes/index.tsx': "export default () => <p title=\"price_list\">x</p>\n" }))).toEqual([])
  })
})

describe('PAY011: webhooks', () => {
  const hand = verify => `export async function POST(request: Request) {\n  const event = await request.json()\n  ${verify}\n  if (event.type === 'checkout.session.completed') grant(event)\n}\n`
  it('a handler that believes its body', async () => {
    expect(codes(await run({ 'src/routes/hook.ts': hand('') }))).toEqual(['PAY011'])
  })
  it('a handler that checks is left alone', async () => {
    expect(codes(await run({ 'src/routes/hook.ts': hand("stripe.webhooks.constructEvent(raw, sig, secret)") }))).toEqual([])
  })
  it('a rail whose `verify` never looks at a signature', async () => {
    const rail = "import type { PayRail } from 'weft/pay'\nexport const rail: Partial<PayRail> = { verify: ({ body }) => JSON.parse(body) }\n"
    expect(codes(await run({ 'src/rail.server.ts': rail }))).toEqual(['PAY011'])
    expect(codes(await run({ 'src/rail.server.ts': rail.replace('({ body })', '({ body, headers })') }))).toEqual([])
  })
})

describe('PAY013: checked only on the client', () => {
  const page = "import { entitlements } from '#/server/pay'\nexport default function P() { const m = entitlements.live(); return <p>{m.value?.includes('pro') ? 'yes' : 'no'}</p> }\n"
  it('fires when nothing on the server names it', async () => {
    const r = await run({ 'src/routes/index.tsx': page })
    expect(codes(r)).toEqual(['PAY013'])
    expect(r.diagnostics[0].fix.text).toContain("requires: ['pro']")
  })
  it('`requires` on the server settles it', async () => {
    expect(codes(await run({ 'src/routes/index.tsx': page, 'src/server/report.ts': "export const r = query({ requires: ['pro'], run: () => 1 })\n" }))).toEqual([])
  })
  it('`ctx.entitlements.has` in a route load settles it', async () => {
    expect(codes(await run({ 'src/routes/index.tsx': page, 'src/routes/data.tsx': "export const load = async ({ ctx }: any) => (await ctx.entitlements.has('pro')) ? 1 : 0\nexport default () => <p />\n" }))).toEqual([])
  })
  it('an array that has nothing to do with payments is ignored', async () => {
    expect(codes(await run({ 'src/routes/index.tsx': "export default ({ xs }: any) => <p>{xs.includes('pro') ? 'y' : 'n'}</p>\n" }))).toEqual([])
  })
})

describe('PAY004: a grant on the client', () => {
  const page = after => `import { checkout } from '#/server/pay'\nimport { state } from 'weft'\nexport default function P() { const isPro = state(false); const busy = state(false)\n  const buy = async () => { busy.value = true; await checkout({ product: 'pro' }); ${after} }\n  return <button onClick={buy}>{isPro.value ? 'y' : 'n'}</button> }\n`
  it('paid state written after `checkout`', async () => {
    expect(codes(await run({ 'src/routes/index.tsx': page('isPro.value = true') }))).toEqual(['PAY004'])
  })
  it('in localStorage too', async () => {
    expect(codes(await run({ 'src/routes/index.tsx': page("localStorage.setItem('pro', '1')") }))).toEqual(['PAY004'])
  })
  it('a spinner is not a grant', async () => {
    expect(codes(await run({ 'src/routes/index.tsx': page('busy.value = false') }))).toEqual([])
  })
})

describe('PAY008: money', () => {
  it('a float, with the integer as a reviewable edit', async () => {
    const dir = project({ 'src/pay/catalog.ts': "import { product } from 'weft/pay'\nexport const a = product({ id: 'a', kind: 'one-time', use: 'digital', price: { usd: 9.99 } })\n" })
    const r = await check(dir)
    const d = r.diagnostics.find(x => x.code === 'PAY008')
    expect(d.fix.edits[0].text).toBe('999')
    expect(d.fix.safe).toBe(false)
  })
  it('a plan\'s float, and a bare number', async () => {
    expect(codes(await run({ 'src/pay/catalog.ts': "export const a = product({ id: 'a', plans: { month: { usd: 9.5, trialDays: 7 } } })\nexport const b = product({ id: 'b', price: 999 })\n" }))).toEqual(['PAY008', 'PAY008'])
  })
  it('integers pass, and `trialDays` is no amount', async () => {
    expect(codes(await run({ 'src/pay/catalog.ts': "export const a = product({ id: 'a', plans: { month: { usd: 999, trialDays: 7 } } })\n" }))).toEqual([])
  })
})

describe('PAY015: an unawaited check', () => {
  const body = "export const r = query({ run: async ({ ctx }) => { if (ctx.entitlements.has('pro')) return 1; return 0 } })\n"
  it('fires, and `weft fix` awaits it', async () => {
    const dir = project({ 'src/server/x.ts': `${server}${body}` })
    expect(codes(await check(dir))).toEqual(['PAY015'])
    await fix(dir)
    expect(readFileSync(join(dir, 'src/server/x.ts'), 'utf8')).toContain("if (await ctx.entitlements.has('pro'))")
    expect(codes(await check(dir))).toEqual([])
  })
  it('an awaited check passes', async () => {
    expect(codes(await run({ 'src/server/x.ts': body.replace('if (ctx', 'if (await ctx') }))).toEqual([])
  })
})

describe('the wiring', () => {
  const rail = "import { definePlugin, defineSlot, provide } from 'weft/plugin'\nconst slot = defineSlot({ id: 'pay.rail', version: 1, cardinality: 'keyed', sides: ['server'] })\nexport default definePlugin({ name: 'acme', contribute: () => ({ provides: [provide(slot, { key: 'stripe', sides: { server: { module: 'acme', export: 'rail' } } })] }) })\n"
  const bound = { 'node_modules/acme/package.json': JSON.stringify({ name: 'acme', type: 'module', version: '0.0.0', exports: { './plugin': './plugin.mjs' } }), 'node_modules/acme/plugin.mjs': rail, 'weft.config.ts': "import acme from 'acme/plugin'\nexport default { plugins: [acme()] }\n" }
  const payFile = store => `import { definePay${store === 'memoryPayStore()' ? ', memoryPayStore' : ''} } from 'weft/pay/server'\nexport default definePay({ catalog: [], store: ${store}, urls: { success: '/', cancel: '/' } })\n`
  it('PAY014: a rail with no ledger', async () => {
    expect(codes(await run(bound))).toEqual(['PAY014'])
  })
  it('P101: a ledger with no rail', async () => {
    expect(codes(await run({ 'src/pay.server.ts': payFile('store') }), /^P101$/)).toEqual(['P101'])
  })
  it('PAY016 and no webhook secret: `.env.example` settles the second', async () => {
    const files = { ...bound, 'src/pay.server.ts': payFile('memoryPayStore()') }
    expect(codes(await run(files))).toEqual(['PAY011', 'PAY016'])
    expect(codes(await run({ ...files, '.env.example': 'STRIPE_WEBHOOK_SECRET=whsec_placeholder\n' }))).toEqual(['PAY016'])
  })
  it('PAY010: a checkout anyone can start', async () => {
    const open = `import { mutation } from '@weft/start'\n${server}export const go = mutation({ run: async ({ ctx }) => pay.checkout(ctx, { product: 'pro' }) })\n`
    expect(codes(await run({ 'src/server/x.ts': open }))).toEqual(['PAY010'])
    expect(codes(await run({ 'src/server/x.ts': open.replace('mutation({ run', "mutation({ auth: 'user', run") }))).toEqual([])
  })
  it('T030: a live key in a test', async () => {
    const key = ['sk', 'live', 'abcdefghijkl'].join('_')
    expect(codes(await run({ 'src/a.test.ts': `test('x', () => expect('${key}').toBeTruthy())\n` }))).toEqual(['T030'])
  })
  it('an app with no payments hears nothing', async () => {
    expect(codes(await run({ 'src/routes/index.tsx': 'export default () => <p>$5 off</p>\n' }))).toEqual([])
  })
  it('PAY005 only where something is sold', async () => {
    const page = "import { checkout } from '#/server/pay'\nexport default () => <button onClick={() => checkout({ product: 'pro' })}>Buy for $9.99</button>\n"
    expect(codes(await run({ 'src/routes/index.tsx': page }))).toEqual(['PAY005'])
  })
  it('every code has a catalog entry with a fix', () => {
    for (const code of ['PAY003', 'PAY004', 'PAY005', 'PAY008', 'PAY010', 'PAY011', 'PAY012', 'PAY013', 'PAY014', 'PAY015', 'PAY016', 'T030']) expect(entry(code)?.fix).toBeTruthy()
  })
})
