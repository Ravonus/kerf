// firestoreSource() for weft.config.ts: the `db.adapter` provider under the key `firestore`, so the lock records it and `weft check` names it.
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'

const slot = defineSlot({ id: 'db.adapter', version: 1, cardinality: 'keyed', sides: ['server'] })

export const firestoreSource = definePlugin({
  name: '@weft-js/db/firestore',
  version: '0.0.0',
  weft: '*',
  permissions: { net: ['driver:firebase-admin'] },
  contribute: () => ({
    provides: [provide(slot, { key: 'firestore', sides: { server: { module: '@weft-js/db/firestore', export: 'adapter' } } })],
    agents: { title: 'Lists (firestore)', text: 'Build a source once, in a server module, with `columns`: only those are selected, returned or written. Then `query({ input: listInput({ sort, filter, search }), run: ({ input }) => source.list(input) })`. warp `Table` reads what comes back. Search is by prefix on one field, and only without another sort.' },
  }),
})

export default firestoreSource
