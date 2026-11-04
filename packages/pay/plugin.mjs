// pay() for weft.config.ts: start here to see how a plugin is put together (`weft docs plugins` walks through it). Everything
// a plugin gives weft is in this one pure manifest: the server part as a slot provider, and its checks, docs, codes and
// `weft add` steps as data. Heavy code stays behind `import()` and the slot's lazy `load()`, so a config load costs little
// and a page costs nothing. A payment provider is a separate plugin: this one defines the ledger, and `pay.rail` is the seam.
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'
import { setup } from './src/setup.mjs'

const extension = defineSlot({
  id: 'server.extension',
  version: 1,
  cardinality: 'keyed',
  sides: ['server'],
})

const diagnostics = [
  [
    'PAY003',
    'error',
    'A Stripe secret, restricted or webhook key in the source, a server secret read in client code, or a key in plugin options',
    'Move it to the server env (`src/env.server.ts`), and roll any real key that was committed',
  ],
  [
    'PAY004',
    'error',
    "Paid state written on the client after `checkout()`, which only opens the rail's page",
    'Read `entitlements` instead: a grant arrives from a verified event',
  ],
  [
    'PAY005',
    'warning',
    'A price typed into a page that sells something',
    '`price(product, plan).display`',
  ],
  [
    'PAY008',
    'error',
    'Money as a float, or with no currency, in `product()`',
    'Whole minor units with a currency: `{ usd: 999 }`',
  ],
  [
    'PAY010',
    'error',
    "A mutation that opens a checkout without `auth: 'user'`",
    "Add `auth: 'user'`: a purchase has to belong to someone",
  ],
  [
    'PAY011',
    'error',
    'A webhook left unverified: a handler of payment events with no signature check, a `PayRail` whose `verify` ignores `headers`, or no `STRIPE_WEBHOOK_SECRET`',
    'Delete the handler: `/_weft/x/pay/<rail>` verifies. Give Stripe that URL, and set `STRIPE_WEBHOOK_SECRET`',
  ],
  [
    'PAY012',
    'error',
    "A rail's price or product id in client code",
    "Name the catalog: `checkout({ product: 'pro', plan: 'month' })`. Map ids on the server: `stripe({ prices: { 'pro.month': … } })`",
  ],
  [
    'PAY013',
    'error',
    'An entitlement checked only on the client: nothing on the server enforces it',
    "`requires: ['pro']` on the query or mutation, or `await ctx.entitlements.has('pro')` in a `load`",
  ],
  [
    'PAY014',
    'error',
    'The plugin with no `src/pay.server.ts`: no webhook is mounted, so payments grant nothing',
    'Default-export `definePay({ … })` from `src/pay.server.ts`',
  ],
  [
    'PAY015',
    'error',
    '`ctx.entitlements.has()` tested without `await`: a promise is truthy, so everyone passes',
    'Await it (`weft fix` does, in an `async` function)',
  ],
  [
    'PAY016',
    'warning',
    '`memoryPayStore()` in `src/pay.server.ts`: a production server refuses to start with it',
    '`drizzlePayStore(db, { purchases, payEvents })`, or your own `PayStore`',
  ],
  [
    'PAY017',
    'error',
    '`@weft-js/pay/server` or `/drizzle` imported in client code',
    'Import them in a server module; the client gets `@weft-js/pay`',
  ],
  [
    'PAY018',
    'error',
    '`src/pay.server.ts` with no `pay.rail` provider',
    'Add a rail to `plugins`: `weft add pay-stripe`',
  ],
  ['PAY031', 'error', 'A live key in a test', '`fakePay` from `@weft-js/pay/test`'],
].map(([code, severity, catches, fix]) => ({ code, severity, catches, fix }))

export const pay = definePlugin({
  name: '@weft-js/pay',
  version: '0.1.0',
  weft: '*',
  namespace: 'PAY',
  permissions: {},
  contribute: () => ({
    provides: [
      provide(extension, {
        key: 'pay',
        sides: { server: { module: '@weft-js/pay/server', export: 'extension' } },
      }),
    ],
    diagnostics,
    check: {
      include: ['src/**/*.{ts,tsx,js,jsx,mts,mjs}', 'test/**/*.{ts,tsx,js,mjs}', 'weft.config.*'],
      run: (ctx) => import('./src/checks.mjs').then((c) => c.run(ctx)),
    },
    docs: {
      topic: 'pay',
      summary:
        'Payments: products, checkout, entitlements, webhooks, fakePay, another provider; PAY-codes',
      file: new URL('./docs/pay.md', import.meta.url).pathname,
    },
    setup,
    agents: {
      title: 'Payments',
      text: 'Products are in `src/pay/catalog.ts`, in minor units. `checkout` and `entitlements` are in `src/server/pay.ts`. App code never names a rail or a price id, and `checkout` grants nothing: a verified webhook does. Enforce on the server, with `requires: [...]` or `await ctx.entitlements.has(...)`: a check only on the client protects nothing. Test with `fakePay` from `@weft-js/pay/test`. `weft docs pay`.',
    },
    catalog: [
      {
        name: 'product',
        import: '@weft-js/pay',
        summary: 'One thing you sell, in integer minor units',
      },
      {
        name: 'price',
        import: '@weft-js/pay',
        summary: "A product's price, formatted for the reader",
      },
      {
        name: 'definePay',
        import: '@weft-js/pay/server',
        summary: 'The ledger: src/pay.server.ts default-exports it',
      },
      {
        name: 'fakePay',
        import: '@weft-js/pay/test',
        summary: 'A rail for tests: renewals, refunds and disputes on the clock',
      },
    ],
    map: [
      {
        want: 'Sell something',
        call: 'add it to `src/pay/catalog.ts`, then `checkout({ product, plan })`',
        have: '`weft docs pay`',
      },
    ],
  }),
})

export default pay
