// What `weft add pay` writes, as data: `weft add` does the writing, so a dry run and a refusal come for free. Plain JS
// strings, because this loads with the config. `run` only describes: the plugin never touches the disk.

const PURCHASE = ['user', 'product', 'plan']

/** `purchases` and `pay_events`, as `drizzlePayStore` reads them: times in ms, so a 32-bit integer won't do. */
function tables(engine) {
  const columns = ({ table, id, str, long }) => `export const purchases = ${table}('purchases', {
  id: ${id}.primaryKey(),
  rail: ${str}.notNull(),
${PURCHASE.map((c) => `  ${c}: ${str},`).join('\n')}
  state: ${str}.notNull(),
  at: ${long}.notNull(),
  expires: ${long},
  customer: ${str},
})

export const payEvents = ${table}('pay_events', {
  id: ${id}.primaryKey(),
  at: ${long}.notNull(),
})
`
  return {
    sqlite: () =>
      `import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'\n\n${columns({ table: 'sqliteTable', id: 'text()', str: 'text()', long: 'integer()' })}`,
    postgres: () =>
      `import { bigint, pgTable, text } from 'drizzle-orm/pg-core'\n\n${columns({ table: 'pgTable', id: 'text()', str: 'text()', long: "bigint({ mode: 'number' })" })}`,
    mysql: () =>
      `import { bigint, mysqlTable, varchar } from 'drizzle-orm/mysql-core'\n\n${columns({ table: 'mysqlTable', id: 'varchar({ length: 191 })', str: 'varchar({ length: 191 })', long: "bigint({ mode: 'number' })" })}`,
  }[engine]()
}

const catalog = `import { product } from '@weft-js/pay'

// What you sell. Amounts are minor units (999 is $9.99), and no rail's ids belong here: this file reaches the client.
export const pro = product({
  id: 'pro',
  kind: 'subscription',
  use: 'digital',
  name: 'Pro',
  plans: { month: { usd: 999 }, year: { usd: 7999, trialDays: 7 } },
  grants: ['pro'],
})
`

const ledger = (
  store,
) => `${store === 'drizzle' ? "import { drizzlePayStore } from '@weft-js/pay/drizzle'\nimport { definePay } from '@weft-js/pay/server'\nimport { db } from '#/db/index.server'\nimport { payEvents, purchases } from '#/db/schema'\n" : "import { definePay, memoryPayStore } from '@weft-js/pay/server'\n"}import * as catalog from './pay/catalog'

// Served at /_weft/x/pay/<rail>, the webhook URL to give your provider. A verified event is the only grant.
export default definePay({ catalog, store: ${store === 'drizzle' ? 'drizzlePayStore(db, { purchases, payEvents })' : 'memoryPayStore()'}, urls: { success: '/', cancel: '/' } })
`

const functions = `import { entitlementTag } from '@weft-js/pay'
import { mutation, query, redirect } from '@weft-js/start'
import pay from '../pay.server'

/** What the signed-in user holds, live: a verified event pokes this user's tag. Render from it; enforce with \`requires\`. */
export const entitlements = query({
  auth: 'user',
  tags: (_, ctx) => [entitlementTag(ctx.user.id)],
  run: ({ ctx }) => ctx.entitlements.list(),
})

/** \`checkout({ product: 'pro', plan: 'month' })\`: on to the rail's page. It grants nothing. */
export const checkout = mutation({
  auth: 'user',
  input: pay.input,
  run: async ({ input, ctx }) => redirect(await pay.checkout(ctx, input), 303),
})

/** Where a buyer manages or cancels. */
export const portal = mutation({
  auth: 'user',
  run: async ({ ctx }) => redirect(await pay.portal(ctx), 303),
})
`

export const setup = {
  with: ['@weft-js/pay/stripe'],
  needs: ['db', 'auth'],
  run({ engine, layer, read }) {
    const drizzle = layer === 'drizzle'
    const env = read('src/env.server.ts') ?? ''
    if (!env.includes('STRIPE_SECRET_KEY') && !/server: \{\n/.test(env))
      throw new Error('src/env.server.ts has no `server: {` block to add the Stripe keys to')
    return {
      files: {
        'src/pay/catalog.ts': catalog,
        'src/pay.server.ts': ledger(drizzle ? 'drizzle' : 'memory'),
        'src/server/pay.ts': functions,
        ...(drizzle && { 'src/db/pay.schema.ts': tables(engine) }),
      },
      edits: {
        ...(!env.includes('STRIPE_SECRET_KEY') && {
          'src/env.server.ts': env.replace(
            'server: {\n',
            'server: {\n    STRIPE_SECRET_KEY: z.string().min(1),\n    STRIPE_WEBHOOK_SECRET: z.string().min(1),\n',
          ),
        }),
        ...(drizzle && {
          'src/db/schema.ts': `${read('src/db/schema.ts').trimEnd()}\n\nexport * from './pay.schema'\n`,
        }),
      },
      env: {
        STRIPE_MODE: 'test',
        STRIPE_SECRET_KEY: 'sk_test_placeholder',
        STRIPE_WEBHOOK_SECRET: 'whsec_placeholder',
      },
      next: [
        ...(drizzle
          ? ['`weft db generate`, then reload: the migration applies on the next request']
          : [
              '`src/pay.server.ts` starts on `memoryPayStore()`: write a `PayStore` on your data layer (PAY016)',
            ]),
        'put your real test keys (`sk_test_…`) in .env; `STRIPE_MODE=test` refuses a live key until you switch it to `live` (PAY032)',
        'locally, `stripe listen --forward-to localhost:5173/_weft/x/pay/stripe` and put the `whsec_` it prints in .env; deployed, give Stripe the webhook URL /_weft/x/pay/stripe',
      ],
    }
  },
}
