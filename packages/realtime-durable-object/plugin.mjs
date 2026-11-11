// durableObject() for kerf.config.ts: declares what the bus reaches. A binding only exists at run time, so unlike the
// other buses it can't be built from options: `src/realtime.server.ts` sets `durableObjectBus({ namespace })`.
import { definePlugin } from '@kerf/core/plugin'

export const durableObject = definePlugin({
  name: '@kerf/realtime-durable-object',
  version: '0.1.0',
  kerf: '*',
  permissions: { net: ['binding:KERF_BUS'] },
  contribute: () => ({
    agents: {
      title: 'Realtime bus (Durable Object)',
      text: "Set `bus: durableObjectBus({ namespace: env.KERF_BUS })` in `src/realtime.server.ts`, and export `KerfBusObject` from the worker with a `new_sqlite_classes` migration. It needs the `cloudflare_durable` preset (R002): a stateless Worker can't hold the socket.",
    },
  }),
})

export default durableObject
