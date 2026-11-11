// mongoSource() for kerf.config.ts: the `db.adapter` provider under the key `mongo`, so the lock records it and `kerf check` names it.
import { definePlugin, defineSlot, provide } from '@kerf-js/core/plugin'

const slot = defineSlot({ id: 'db.adapter', version: 1, cardinality: 'keyed', sides: ['server'] })

export const mongoSource = definePlugin({
  name: '@kerf-js/db/mongo',
  version: '0.0.0',
  kerf: '*',
  permissions: { net: ['driver:mongodb'] },
  contribute: () => ({
    provides: [
      provide(slot, {
        key: 'mongo',
        sides: { server: { module: '@kerf-js/db/mongo', export: 'adapter' } },
      }),
    ],
    agents: {
      title: 'Lists (mongo)',
      text: 'Build a source once, in a server module, with `columns`: only those are selected, returned or written. Then `query({ input: listInput({ sort, filter, search }), run: ({ input }) => source.list(input) })`. veneer `Table` reads what comes back. `watchMongo` turns writes from anywhere into tag pokes.',
    },
  }),
})

export default mongoSource
