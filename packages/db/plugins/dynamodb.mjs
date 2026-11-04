// dynamoSource() for weft.config.ts: the `db.adapter` provider under the key `dynamodb`, so the lock records it and `weft check` names it.
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'

const slot = defineSlot({ id: 'db.adapter', version: 1, cardinality: 'keyed', sides: ['server'] })

export const dynamoSource = definePlugin({
  name: '@weft-js/db/dynamodb',
  version: '0.0.0',
  weft: '*',
  permissions: { net: ['driver:aws-sdk'] },
  contribute: () => ({
    provides: [
      provide(slot, {
        key: 'dynamodb',
        sides: { server: { module: '@weft-js/db/dynamodb', export: 'adapter' } },
      }),
    ],
    agents: {
      title: 'Lists (dynamodb)',
      text: 'Build a source once, in a server module, with `columns`: only those are selected, returned or written. Then `query({ input: listInput({ sort, filter, search }), run: ({ input }) => source.list(input) })`. warp `Table` reads what comes back. Cursor mode only, and a sort needs a partition and an index.',
    },
  }),
})

export default dynamoSource
