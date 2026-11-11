// stripe() for weft.config.ts: this package as the `pay.rail` provider for the web. Options are in the generated slot
// module, so they name env vars and never hold a key (PAY003). Another provider is this one line swapped for another.
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'

const slot = defineSlot({
  id: 'pay.rail',
  version: 1,
  cardinality: 'keyed',
  sides: ['server', 'client', 'native'],
})

export const stripe = definePlugin({
  name: '@weft-js/pay/stripe',
  version: '0.0.0',
  weft: '*',
  permissions: {
    net: ['api.stripe.com'],
    env: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_MODE', 'STRIPE_PUBLISHABLE_KEY'],
  },
  contribute: (options) => ({
    provides: [
      provide(slot, {
        key: 'stripe',
        sides: { server: { module: '@weft-js/pay/stripe', export: 'stripeRail', options } },
      }),
    ],
    agents: {
      title: 'Pay rail: Stripe',
      text: 'Stripe Checkout, server side only: `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` for `/_weft/x/pay/stripe`, the webhook URL to give Stripe. Test mode is an `sk_test_` key; `STRIPE_MODE=test` makes a live key an error (PAY032). Test card 4242 4242 4242 4242; `stripe listen --forward-to localhost:5173/_weft/x/pay/stripe` for local webhooks.',
    },
    map: [
      {
        want: 'Change the payment provider',
        call: 'replace this plugin in `plugins`: app code stays',
        have: 'Stripe Checkout',
      },
    ],
  }),
})

export default stripe
