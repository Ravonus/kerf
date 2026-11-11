// prismaSource() for kerf.config.ts: the `db.adapter` provider under the key `prisma`, so the lock records it and `kerf check` names it.
import { definePlugin, defineSlot, provide } from '@kerf-js/core/plugin'

const slot = defineSlot({ id: 'db.adapter', version: 1, cardinality: 'keyed', sides: ['server'] })

export const prismaSource = definePlugin({
  name: '@kerf-js/db/prisma',
  version: '0.0.0',
  kerf: '*',
  permissions: { net: ['driver:prisma'] },
  contribute: () => ({
    provides: [
      provide(slot, {
        key: 'prisma',
        sides: { server: { module: '@kerf-js/db/prisma', export: 'adapter' } },
      }),
    ],
    agents: {
      title: 'Lists (prisma)',
      text: 'Build a source once, in a server module, with `columns`: only those are selected, returned or written. Then `query({ input: listInput({ sort, filter, search }), run: ({ input }) => source.list(input) })`. veneer `Table` reads what comes back.',
    },
  }),
})

export default prismaSource
