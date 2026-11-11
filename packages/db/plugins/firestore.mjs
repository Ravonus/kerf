// firestoreSource() for kerf.config.ts: the `db.adapter` provider under the key `firestore`, so the lock records it and `kerf check` names it.
import { definePlugin, defineSlot, provide } from '@kerf/core/plugin'

const slot = defineSlot({ id: 'db.adapter', version: 1, cardinality: 'keyed', sides: ['server'] })

export const firestoreSource = definePlugin({
  name: '@kerf/db/firestore',
  version: '0.0.0',
  kerf: '*',
  permissions: { net: ['driver:firebase-admin'] },
  contribute: () => ({
    provides: [
      provide(slot, {
        key: 'firestore',
        sides: { server: { module: '@kerf/db/firestore', export: 'adapter' } },
      }),
    ],
    agents: {
      title: 'Lists (firestore)',
      text: 'Build a source once, in a server module, with `columns`: only those are selected, returned or written. Then `query({ input: listInput({ sort, filter, search }), run: ({ input }) => source.list(input) })`. veneer `Table` reads what comes back. Search is by prefix on one field, and only without another sort.',
    },
  }),
})

export default firestoreSource
