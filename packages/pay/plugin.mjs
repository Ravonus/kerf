// pay() for kerf.config.ts: start here to see how a plugin is put together (`kerf docs plugins` walks through it). Everything
// a plugin gives kerf is in this one pure manifest: the server part as a slot provider, and its checks, docs, codes and
// `kerf add` steps as data. Heavy code stays behind `import()` and the slot's lazy `load()`, so a config load costs little
// and a page costs nothing. A payment provider is a separate plugin: this one defines the ledger, and `pay.rail` is the seam.
import { definePlugin, defineSlot, provide } from '@kerf-js/core/plugin'
import { setup } from './src/setup.mjs'
import { diagnostics } from './src/diagnostics.mjs'

const extension = defineSlot({
  id: 'server.extension',
  version: 1,
  cardinality: 'keyed',
  sides: ['server'],
})

export const pay = definePlugin({
  name: '@kerf-js/pay',
  version: '0.1.0',
  kerf: '*',
  namespace: 'PAY',
  permissions: {},
  contribute: () => ({
    provides: [
      provide(extension, {
        key: 'pay',
        sides: { server: { module: '@kerf-js/pay/server', export: 'extension' } },
      }),
    ],
    diagnostics,
    check: {
      include: ['src/**/*.{ts,tsx,js,jsx,mts,mjs}', 'test/**/*.{ts,tsx,js,mjs}', 'kerf.config.*'],
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
      text: 'Products are in `src/pay/catalog.ts`, in minor units. `checkout` and `entitlements` are in `src/server/pay.ts`. App code never names a rail or a price id, and `checkout` grants nothing: a verified webhook does. Enforce on the server, with `requires: [...]` or `await ctx.entitlements.has(...)`: a check only on the client protects nothing. Test with `fakePay` from `@kerf-js/pay/test`. `kerf docs pay`.',
    },
    catalog: [
      {
        name: 'product',
        import: '@kerf-js/pay',
        summary: 'One thing you sell, in integer minor units',
      },
      {
        name: 'price',
        import: '@kerf-js/pay',
        summary: "A product's price, formatted for the reader",
      },
      {
        name: 'definePay',
        import: '@kerf-js/pay/server',
        summary: 'The ledger: src/pay.server.ts default-exports it',
      },
      {
        name: 'fakePay',
        import: '@kerf-js/pay/test',
        summary: 'A rail for tests: renewals, refunds and disputes on the clock',
      },
    ],
    map: [
      {
        want: 'Sell something',
        call: 'add it to `src/pay/catalog.ts`, then `checkout({ product, plan })`',
        have: '`kerf docs pay`',
      },
    ],
  }),
})

export default pay
