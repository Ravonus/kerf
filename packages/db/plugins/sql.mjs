// sqlSource() for weft.config.ts: the `db.adapter` provider under the key `sql`, so the lock records it and `weft check` names it.
import { definePlugin, defineSlot, provide } from 'weft/plugin'

const slot = defineSlot({ id: 'db.adapter', version: 1, cardinality: 'keyed', sides: ['server'] })

export const sqlSource = definePlugin({
  name: '@weft/db-sql',
  version: '0.0.0',
  weft: '*',
  permissions: { net: ['driver:query'] },
  contribute: () => ({
    provides: [provide(slot, { key: 'sql', sides: { server: { module: '@weft/db-sql', export: 'adapter' } } })],
    agents: { title: 'Lists (sql)', text: 'Build a source once, in a server module, with `columns`: only those are selected, returned or written. Then `query({ input: listInput({ sort, filter, search }), run: ({ input }) => source.list(input) })`. warp `Table` reads what comes back.' },
  }),
})

export default sqlSource
