// mongoSource() for weft.config.ts: the `db.adapter` provider under the key `mongo`, so the lock records it and `weft check` names it.
import { definePlugin, defineSlot, provide } from 'weft/plugin'

const slot = defineSlot({ id: 'db.adapter', version: 1, cardinality: 'keyed', sides: ['server'] })

export const mongoSource = definePlugin({
  name: '@weft/db-mongo',
  version: '0.0.0',
  weft: '*',
  permissions: { net: ['driver:mongodb'] },
  contribute: () => ({
    provides: [provide(slot, { key: 'mongo', sides: { server: { module: '@weft/db-mongo', export: 'adapter' } } })],
    agents: { title: 'Lists (mongo)', text: 'Build a source once, in a server module, with `columns`: only those are selected, returned or written. Then `query({ input: listInput({ sort, filter, search }), run: ({ input }) => source.list(input) })`. warp `Table` reads what comes back. `watchMongo` turns writes from anywhere into tag pokes.' },
  }),
})

export default mongoSource
