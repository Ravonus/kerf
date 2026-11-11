// sqlSource() for kerf.config.ts: the `db.adapter` provider under the key `sql`, so the lock records it and `kerf check` names it.
import { definePlugin, defineSlot, provide } from '@kerf-js/core/plugin'

const slot = defineSlot({ id: 'db.adapter', version: 1, cardinality: 'keyed', sides: ['server'] })

export const sqlSource = definePlugin({
  name: '@kerf-js/db/sql',
  version: '0.0.0',
  kerf: '*',
  permissions: { net: ['driver:query'] },
  contribute: () => ({
    provides: [
      provide(slot, {
        key: 'sql',
        sides: { server: { module: '@kerf-js/db/sql', export: 'adapter' } },
      }),
    ],
    agents: {
      title: 'Lists (sql)',
      text: 'Build a source once, in a server module, with `columns`: only those are selected, returned or written. Then `query({ input: listInput({ sort, filter, search }), run: ({ input }) => source.list(input) })`. veneer `Table` reads what comes back.',
    },
  }),
})

export default sqlSource
