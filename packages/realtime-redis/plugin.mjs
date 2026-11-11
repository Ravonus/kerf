// redis() for kerf.config.ts: this package as the `realtime.bus` provider. Listed here, it replaces the memory bus, and
// a bus set in `src/realtime.server.ts` still wins.
import { definePlugin, defineSlot, provide } from '@kerf-js/core/plugin'

const slot = defineSlot({ id: 'realtime.bus', version: 1, cardinality: 'one', sides: ['server'] })

export const redis = definePlugin({
  name: '@kerf-js/realtime-redis',
  version: '0.1.0',
  kerf: '*',
  permissions: { net: ['env:REDIS_URL'], env: ['REDIS_URL', 'KERF_BUILD'] },
  contribute: (options) => ({
    provides: [
      provide(slot, {
        sides: { server: { module: '@kerf-js/realtime-redis', export: 'bus', options } },
      }),
    ],
    agents: {
      title: 'Realtime bus (Redis)',
      text: '`realtime.bus` is Redis, at `REDIS_URL`. Rooms, shared state, `.live` and streams reach every instance. It is at-most-once: anything that must survive is a mutation, and `collect` plus a query covers a gap.',
    },
    map: [
      {
        want: 'Change the realtime bus',
        call: 'replace this plugin in `plugins`, or set `bus` in `src/realtime.server.ts`',
        have: 'Redis',
      },
    ],
  }),
})

export default redis
