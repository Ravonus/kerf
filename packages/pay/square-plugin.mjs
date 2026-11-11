// square() for kerf.config.ts: Square as the `pay.rail` provider, so web orders land in the same account as the shop's
// card readers. Options are in the generated slot module, so they name env vars and never hold a token (PAY003).
import { definePlugin, defineSlot, provide } from '@kerf-js/core/plugin'

const slot = defineSlot({
  id: 'pay.rail',
  version: 1,
  cardinality: 'keyed',
  sides: ['server', 'client', 'native'],
})

/** What `kerf add pay-square` writes: the sandbox's variables, empty but for the switch, in .env and .env.example. */
const setup = {
  run: () => ({
    env: {
      SQUARE_ENVIRONMENT: 'sandbox',
      SQUARE_ACCESS_TOKEN: 'square_sandbox_placeholder',
      SQUARE_LOCATION_ID: '',
      SQUARE_APPLICATION_ID: '',
      SQUARE_WEBHOOK_SIGNATURE_KEY: '',
      SQUARE_WEBHOOK_URL: '',
    },
    next: [
      "from the Developer Console's Sandbox tab, put the sandbox access token, a sandbox location and the `sandbox-sq0idb-…` app id in .env",
      'set SQUARE_ENVIRONMENT=production with the production token and location to go live: a sandbox app id is then refused (PAY032)',
      'give Square the webhook URL /_kerf/x/pay/square (a tunnel locally), the same string as SQUARE_WEBHOOK_URL',
    ],
  }),
}

export const square = definePlugin({
  name: '@kerf-js/pay/square',
  version: '0.0.0',
  kerf: '*',
  permissions: {
    net: ['connect.squareup.com', 'connect.squareupsandbox.com'],
    env: [
      'SQUARE_ACCESS_TOKEN',
      'SQUARE_LOCATION_ID',
      'SQUARE_WEBHOOK_SIGNATURE_KEY',
      'SQUARE_WEBHOOK_URL',
      'SQUARE_ENVIRONMENT',
      'SQUARE_ENV',
      'SQUARE_APPLICATION_ID',
    ],
  },
  contribute: (options) => ({
    setup,
    provides: [
      provide(slot, {
        key: 'square',
        sides: { server: { module: '@kerf-js/pay/square', export: 'squareRail', options } },
      }),
    ],
    agents: {
      title: 'Pay rail: Square',
      text: 'Square payment links, one-time payments only (`pay.order`, one-time products): `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, and for `/_kerf/x/pay/square` (subscribe it to `payment.created` and `payment.updated`) `SQUARE_WEBHOOK_SIGNATURE_KEY` plus `SQUARE_WEBHOOK_URL`, the exact URL given to Square. For the sandbox, `SQUARE_ENVIRONMENT=sandbox` with the token, location and app id (`sandbox-sq0idb-…`); a mismatch is PAY032. Pay on the hosted page with test card 4111 1111 1111 1111.',
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
