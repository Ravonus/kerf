// square() for weft.config.ts: Square as the `pay.rail` provider, so web orders land in the same account as the shop's
// card readers. Options are in the generated slot module, so they name env vars and never hold a token (PAY003).
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'

const slot = defineSlot({
  id: 'pay.rail',
  version: 1,
  cardinality: 'keyed',
  sides: ['server', 'client', 'native'],
})

export const square = definePlugin({
  name: '@weft-js/pay/square',
  version: '0.0.0',
  weft: '*',
  permissions: {
    net: ['connect.squareup.com', 'connect.squareupsandbox.com'],
    env: [
      'SQUARE_ACCESS_TOKEN',
      'SQUARE_LOCATION_ID',
      'SQUARE_WEBHOOK_SIGNATURE_KEY',
      'SQUARE_WEBHOOK_URL',
      'SQUARE_ENV',
    ],
  },
  contribute: (options) => ({
    provides: [
      provide(slot, {
        key: 'square',
        sides: { server: { module: '@weft-js/pay/square', export: 'squareRail', options } },
      }),
    ],
    agents: {
      title: 'Pay rail: Square',
      text: 'Square payment links, one-time payments only (`pay.order`, one-time products): `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, and for `/_weft/x/pay/square` (subscribe it to `payment.created` and `payment.updated`) `SQUARE_WEBHOOK_SIGNATURE_KEY` plus `SQUARE_WEBHOOK_URL`, the exact URL given to Square. `SQUARE_ENV=sandbox` for test.',
    },
    map: [
      {
        want: 'Change the payment provider',
        call: 'replace this plugin in `plugins`: app code stays',
        have: 'Square payment links',
      },
    ],
  }),
})

export default square
