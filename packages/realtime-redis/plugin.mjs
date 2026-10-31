// redis() for weft.config.ts: this package as the `realtime.bus` provider. Listed here, it replaces the memory bus, and
// a bus set in `src/realtime.server.ts` still wins.
import { definePlugin, defineSlot, provide } from 'weft/plugin'

const slot = defineSlot({ id: 'realtime.bus', version: 1, cardinality: 'one', sides: ['server'] })

export const redis = definePlugin({
  name: '@weft/realtime-redis',
  version: '0.0.0',
  weft: '*',
  permissions: { net: ['env:REDIS_URL'], env: ['REDIS_URL', 'WEFT_BUILD'] },
  contribute: (options = {}) => ({
    provides: [provide(slot, { sides: { server: { module: '@weft/realtime-redis', export: 'bus', options } } })],
    agents: { title: 'Realtime bus (Redis)', text: '`realtime.bus` is Redis, at `REDIS_URL`. Rooms, shared state, `.live` and streams reach every instance. It is at-most-once: anything that must survive is a mutation, and `collect` plus a query covers a gap.' },
    map: [{ want: 'Change the realtime bus', call: 'replace this plugin in `plugins`, or set `bus` in `src/realtime.server.ts`', have: 'Redis' }],
  }),
})

export default redis
