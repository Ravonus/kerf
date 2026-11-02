// durableObject() for weft.config.ts: declares what the bus reaches. A binding only exists at run time, so unlike the
// other buses it can't be built from options: `src/realtime.server.ts` sets `durableObjectBus({ namespace })`.
import { definePlugin } from '@weft-js/core/plugin'

export const durableObject = definePlugin({
  name: '@weft-js/realtime-durable-object',
  version: '0.1.0',
  weft: '*',
  permissions: { net: ['binding:WEFT_BUS'] },
  contribute: () => ({
    agents: { title: 'Realtime bus (Durable Object)', text: 'Set `bus: durableObjectBus({ namespace: env.WEFT_BUS })` in `src/realtime.server.ts`, and export `WeftBusObject` from the worker with a `new_sqlite_classes` migration. It needs the `cloudflare_durable` preset (R002): a stateless Worker can\'t hold the socket.' },
  }),
})

export default durableObject
