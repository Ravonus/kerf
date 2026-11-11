// The PAY-codes (research 10 §7, 37): each fires on the mistake and stays quiet on the fix. A check hook is a function of its
// `ctx`, so most of this is a plain map of files; the last block runs it through a real `kerf check` and `kerf fix`.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { check } from '../../cli/src/check.mjs'
import { fix } from '../../cli/src/fix.mjs'
import { project } from '../../cli/test/helpers.mjs'
import pay from '../plugin.mjs'
import { run as checks } from '../src/checks.mjs'
import type { CheckContext, Finding, PluginEnv } from '@kerf-js/core/plugin'

const runChecks = checks as (
  ctx: Pick<CheckContext, 'files' | 'read' | 'exists' | 'slots'>,
) => Finding[]

const ledger =
  "import { definePay } from '@kerf-js/pay/server'\nexport default definePay({ catalog: [], store, urls: { success: '/', cancel: '/' } })\n"
const app = {
  'src/pay.server.ts': ledger,
  '.env.example': 'STRIPE_WEBHOOK_SECRET=whsec_placeholder\n',
}
const stripe = { 'pay.rail': { stripe: '@kerf-js/pay/stripe' } }
const hook = (files: Record<string, string>, slots: CheckContext['slots'] = stripe) =>
  runChecks({
    files: Object.keys(files),
    read: (rel) => files[rel] ?? '',
    exists: (rel) => rel in files,
    slots,
  })
const run = (files: Record<string, string>) =>
  Promise.resolve({ diagnostics: hook({ ...app, ...files }) })
const codes = (r: { diagnostics: Finding[] }) => r.diagnostics.map((d) => d.code)
const server = "import pay from '../pay.server'\n"

describe('PAY003: keys', () => {
  const key = ['sk', 'live', 'abcdefghijkl'].join('_')
  it('a key in the source, in any file', async () => {
    expect(codes(await run({ 'src/server/stripe.ts': `export const k = '${key}'\n` }))).toEqual([
      'PAY003',
    ])
  })
  it('a server secret read in client code, and only there', async () => {
    expect(
      codes(
        await run({
          'src/routes/index.tsx': 'export default () => <p>{process.env.STRIPE_SECRET_KEY}</p>\n',
        }),
      ),
    ).toEqual(['PAY003'])
    expect(
      codes(await run({ 'src/server/x.ts': 'export const k = process.env.STRIPE_SECRET_KEY\n' })),
    ).toEqual([])
  })
  it('a key in plugin options', async () => {
    expect(
      codes(
        await run({
          'kerf.config.ts':
            'const stripe = (o: object) => ({ name: "x" })\nexport default { plugins: [stripe({ secretKey: process.env.K })] }\n',
        }),
      ),
    ).toContain('PAY003')
  })
  it('an obvious placeholder is not a key', async () => {
    expect(
      codes(await run({ 'src/server/x.ts': "export const k = 'sk_test_placeholder'\n" })),
    ).toEqual([])
  })
})

describe('PAY012: rail ids', () => {
  it('a price id in client code', async () => {
    const r = await run({
      'src/routes/index.tsx':
        'export default () => <button data-price="x" onClick={() => go(\'price_1AbCdEfGhIjK\')}>Buy</button>\n',
    })
    expect(codes(r)).toEqual(['PAY012'])
  })
  it('a price id on the server is its own business', async () => {
    expect(
      codes(await run({ 'src/server/x.ts': "export const id = 'price_1AbCdEfGhIjK'\n" })),
    ).toEqual([])
  })
  it('the word in a string is not an id', async () => {
    expect(
      codes(
        await run({ 'src/routes/index.tsx': 'export default () => <p title="price_list">x</p>\n' }),
      ),
    ).toEqual([])
  })
})

describe('PAY011: webhooks', () => {
  const hand = (verify: string) =>
    `export async function POST(request: Request) {\n  const event = await request.json()\n  ${verify}\n  if (event.type === 'checkout.session.completed') grant(event)\n}\n`
  it('a handler that believes its body', async () => {
    expect(codes(await run({ 'src/routes/hook.ts': hand('') }))).toEqual(['PAY011'])
  })
  it('a handler that checks is left alone', async () => {
    expect(
      codes(
        await run({
          'src/routes/hook.ts': hand('stripe.webhooks.constructEvent(raw, sig, secret)'),
        }),
      ),
    ).toEqual([])
  })
  it('a rail whose `verify` never looks at a signature', async () => {
    const rail =
      "import type { PayRail } from '@kerf-js/pay'\nexport const rail: Partial<PayRail> = { verify: ({ body }) => JSON.parse(body) }\n"
    expect(codes(await run({ 'src/rail.server.ts': rail }))).toEqual(['PAY011'])
    expect(
      codes(await run({ 'src/rail.server.ts': rail.replace('({ body })', '({ body, headers })') })),
    ).toEqual([])
  })
})

describe('PAY013: checked only on the client', () => {
  const page =
    "import { entitlements } from '#/server/pay'\nexport default function P() { const m = entitlements.live(); return <p>{m.value?.includes('pro') ? 'yes' : 'no'}</p> }\n"
  it('fires when nothing on the server names it', async () => {
    const r = await run({ 'src/routes/index.tsx': page })
    expect(codes(r)).toEqual(['PAY013'])
    expect(r.diagnostics[0]!.help).toContain("requires: ['pro']")
  })
  it('`requires` on the server settles it', async () => {
    expect(
      codes(
        await run({
          'src/routes/index.tsx': page,
          'src/server/report.ts': "export const r = query({ requires: ['pro'], run: () => 1 })\n",
        }),
      ),
    ).toEqual([])
  })
  it('`ctx.entitlements.has` in a route load settles it', async () => {
    expect(
      codes(
        await run({
          'src/routes/index.tsx': page,
          'src/routes/data.tsx':
            "export const load = async ({ ctx }: any) => (await ctx.entitlements.has('pro')) ? 1 : 0\nexport default () => <p />\n",
        }),
      ),
    ).toEqual([])
  })
  it('an array that has nothing to do with payments is ignored', async () => {
    expect(
      codes(
        await run({
          'src/routes/index.tsx':
            "export default ({ xs }: any) => <p>{xs.includes('pro') ? 'y' : 'n'}</p>\n",
        }),
      ),
    ).toEqual([])
  })
})

describe('PAY004: a grant on the client', () => {
  const page = (after: string) =>
    `import { checkout } from '#/server/pay'\nimport { state } from '@kerf-js/core'\nexport default function P() { const isPro = state(false); const busy = state(false)\n  const buy = async () => { busy.value = true; await checkout({ product: 'pro' }); ${after} }\n  return <button onClick={buy}>{isPro.value ? 'y' : 'n'}</button> }\n`
  it('paid state written after `checkout`', async () => {
    expect(codes(await run({ 'src/routes/index.tsx': page('isPro.value = true') }))).toEqual([
      'PAY004',
    ])
  })
  it('in localStorage too', async () => {
    expect(
      codes(await run({ 'src/routes/index.tsx': page("localStorage.setItem('pro', '1')") })),
    ).toEqual(['PAY004'])
  })
  it('a spinner is not a grant', async () => {
    expect(codes(await run({ 'src/routes/index.tsx': page('busy.value = false') }))).toEqual([])
  })
})

describe('PAY008: money', () => {
  it('a float, with the integer as a reviewable edit', async () => {
    const r = await run({
      'src/pay/catalog.ts':
        "import { product } from '@kerf-js/pay'\nexport const a = product({ id: 'a', kind: 'one-time', use: 'digital', price: { usd: 9.99 } })\n",
    })
    const d = r.diagnostics.find((x) => x.code === 'PAY008')
    expect(d!.fix!.edits[0]!.text).toBe('999')
    expect(d!.fix!.safe).toBe(false)
  })
  it("a plan's float, and a bare number", async () => {
    expect(
      codes(
        await run({
          'src/pay/catalog.ts':
            "export const a = product({ id: 'a', plans: { month: { usd: 9.5, trialDays: 7 } } })\nexport const b = product({ id: 'b', price: 999 })\n",
        }),
      ),
    ).toEqual(['PAY008', 'PAY008'])
  })
  it('integers pass, and `trialDays` is no amount', async () => {
    expect(
      codes(
        await run({
          'src/pay/catalog.ts':
            "export const a = product({ id: 'a', plans: { month: { usd: 999, trialDays: 7 } } })\n",
        }),
      ),
    ).toEqual([])
  })
})

describe('PAY015: an unawaited check', () => {
  const body =
    "export const r = query({ run: async ({ ctx }) => { if (ctx.entitlements.has('pro')) return 1; return 0 } })\n"
  it('fires, with a safe fix', async () => {
    const [d] = (await run({ 'src/server/x.ts': `${server}${body}` })).diagnostics
    expect(d).toMatchObject({ code: 'PAY015', fix: { safe: true, edits: [{ text: 'await ' }] } })
  })
  it('an awaited check passes', async () => {
    expect(
      codes(await run({ 'src/server/x.ts': body.replace('if (ctx', 'if (await ctx') })),
    ).toEqual([])
  })
})

describe('the wiring', () => {
  const wired = (files: Record<string, string>, slots?: CheckContext['slots']) =>
    hook(files, slots).map((d) => d.code)
  it('PAY014: the plugin with no ledger', () => {
    expect(wired({})).toEqual(['PAY014'])
  })
  it('PAY018: a ledger with no rail', () => {
    expect(wired(app, {})).toEqual(['PAY018'])
  })
  it('PAY016 and no webhook secret: `.env.example` settles the second', () => {
    const files = { 'src/pay.server.ts': ledger.replace('store,', 'store: memoryPayStore(),') }
    expect(wired(files).sort()).toEqual(['PAY011', 'PAY016'])
    expect(wired({ ...files, '.env.example': app['.env.example'] })).toEqual(['PAY016'])
  })
  it('PAY010: a checkout anyone can start', async () => {
    const open = `import { mutation } from '@kerf-js/start'\n${server}export const go = mutation({ run: async ({ ctx }) => pay.checkout(ctx, { product: 'pro' }) })\n`
    expect(codes(await run({ 'src/server/x.ts': open }))).toEqual(['PAY010'])
    expect(
      codes(
        await run({
          'src/server/x.ts': open.replace('mutation({ run', "mutation({ auth: 'user', run"),
        }),
      ),
    ).toEqual([])
  })
  it('PAY017: the ledger in client code', async () => {
    expect(
      codes(
        await run({
          'src/routes/index.tsx':
            "import { definePay } from '@kerf-js/pay/server'\nexport default () => <p>{String(definePay)}</p>\n",
        }),
      ),
    ).toEqual(['PAY017'])
  })
  it('PAY031: a live key in a test', async () => {
    const key = ['sk', 'live', 'abcdefghijkl'].join('_')
    expect(
      codes(await run({ 'src/a.test.ts': `test('x', () => expect('${key}').toBeTruthy())\n` })),
    ).toEqual(['PAY031'])
  })
  it('an app with nothing to report hears nothing', async () => {
    expect(
      codes(await run({ 'src/routes/index.tsx': 'export default () => <p>$5 off</p>\n' })),
    ).toEqual([])
  })
  it('PAY005 only where something is sold', async () => {
    const page =
      "import { checkout } from '#/server/pay'\nexport default () => <button onClick={() => checkout({ product: 'pro' })}>Buy for $9.99</button>\n"
    expect(codes(await run({ 'src/routes/index.tsx': page }))).toEqual(['PAY005'])
  })
  it('every code it can report is declared, with a fix', () => {
    const declared = pay().contribute({} as PluginEnv).diagnostics!
    const source = readFileSync(new URL('../src/checks.mjs', import.meta.url), 'utf8')
    for (const [code] of source.matchAll(/PAY\d{3}/g))
      expect(declared.find((d) => d.code === code)?.fix).toBeTruthy()
  })
})

describe('through `kerf check`', () => {
  const body =
    "import { query } from '@kerf-js/start'\nexport const r = query({ run: async ({ ctx }) => { if (ctx.entitlements.has('pro')) return 1; return 0 } })\n"
  const config =
    "import pay from '../../../../pay/plugin.mjs'\nexport default { plugins: [pay()] }\n"
  it('reports what the hook found, and `kerf fix` applies its edit', async () => {
    const dir = project({
      'kerf.config.ts': config,
      'src/pay.server.ts': ledger,
      'src/server/x.ts': body,
    })
    const found = (at: string) =>
      check(at).then((r) =>
        r.diagnostics.filter((d) => d.code.startsWith('PAY')).map((d) => d.code),
      )
    expect(await found(dir)).toEqual(expect.arrayContaining(['PAY015', 'PAY018']))
    await fix(dir)
    expect(readFileSync(join(dir, 'src/server/x.ts'), 'utf8')).toContain(
      "if (await ctx.entitlements.has('pro'))",
    )
    expect(await found(dir)).not.toContain('PAY015')
  })
})
