// prismaSource() for weft.config.ts: the `db.adapter` provider under the key `prisma`, so the lock records it and `weft check` names it.
import { definePlugin, defineSlot, provide } from 'weft/plugin'

const slot = defineSlot({ id: 'db.adapter', version: 1, cardinality: 'keyed', sides: ['server'] })

export const prismaSource = definePlugin({
  name: '@weft/db-prisma',
  version: '0.0.0',
  weft: '*',
  permissions: { net: ['driver:prisma'] },
  contribute: () => ({
    provides: [provide(slot, { key: 'prisma', sides: { server: { module: '@weft/db-prisma', export: 'adapter' } } })],
    agents: { title: 'Lists (prisma)', text: 'Build a source once, in a server module, with `columns`: only those are selected, returned or written. Then `query({ input: listInput({ sort, filter, search }), run: ({ input }) => source.list(input) })`. warp `Table` reads what comes back.' },
  }),
})

export default prismaSource
