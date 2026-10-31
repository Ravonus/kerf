// kyselySource() for weft.config.ts: the `db.adapter` provider under the key `kysely`, so the lock records it and `weft check` names it.
import { definePlugin, defineSlot, provide } from 'weft/plugin'

const slot = defineSlot({ id: 'db.adapter', version: 1, cardinality: 'keyed', sides: ['server'] })

export const kyselySource = definePlugin({
  name: '@weft/db-kysely',
  version: '0.0.0',
  weft: '*',
  permissions: { net: ['driver:kysely'] },
  contribute: () => ({
    provides: [provide(slot, { key: 'kysely', sides: { server: { module: '@weft/db-kysely', export: 'adapter' } } })],
    agents: { title: 'Lists (kysely)', text: 'Build a source once, in a server module, with `columns`: only those are selected, returned or written. Then `query({ input: listInput({ sort, filter, search }), run: ({ input }) => source.list(input) })`. warp `Table` reads what comes back.' },
  }),
})

export default kyselySource
