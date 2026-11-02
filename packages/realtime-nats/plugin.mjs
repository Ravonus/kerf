// nats() for weft.config.ts: this package as the `realtime.bus` provider. Listed here, it replaces the memory bus, and
// a bus set in `src/realtime.server.ts` still wins.
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'

const slot = defineSlot({ id: 'realtime.bus', version: 1, cardinality: 'one', sides: ['server'] })

export const nats = definePlugin({
  name: '@weft-js/realtime-nats',
  version: '0.1.0',
  weft: '*',
  permissions: { net: ['env:NATS_URL'], env: ['NATS_URL', 'WEFT_BUILD'] },
  contribute: options => ({
    provides: [provide(slot, { sides: { server: { module: '@weft-js/realtime-nats', export: 'bus', options } } })],
    agents: { title: 'Realtime bus (NATS)', text: '`realtime.bus` is NATS, at `NATS_URL`. Rooms, shared state, `.live` and streams reach every instance. It is at-most-once: anything that must survive is a mutation, and `collect` plus a query covers a gap.' },
    map: [{ want: 'Change the realtime bus', call: 'replace this plugin in `plugins`, or set `bus` in `src/realtime.server.ts`', have: 'NATS' }],
  }),
})

export default nats
