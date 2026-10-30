// native() for weft.config.ts (research 34 §4): the no-ORM data layer. It holds what the CLI needs: where migrations
// live and how `weft db generate` starts one. The runtime is `@weft/plugin-db-native/<engine>`.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { definePlugin } from 'weft/plugin'

const DIR = 'migrations'

/** A new, empty, numbered migration for you to write: with no schema there is nothing to diff. */
function generate(root, name = 'change') {
  const dir = join(root, DIR)
  mkdirSync(dir, { recursive: true })
  const next = readdirSync(dir).filter(f => f.endsWith('.sql')).length
  const file = `${String(next).padStart(4, '0')}_${name.replace(/[^\w-]/g, '_')}.sql`
  writeFileSync(join(dir, file), '-- Applies on the next request. Migrations run once, in file order.\n')
  return `${DIR}/${file}`
}

export const native = definePlugin({
  name: '@weft/plugin-db-native',
  version: '0.0.0',
  weft: '*',
  permissions: {},
  contribute: () => ({
    db: { layer: 'native', migrations: DIR, generate },
    agents: { title: 'Database (Native)', text: 'No ORM: `ctx.db.sql` is a tagged template, and values are always bound, never concatenated. Rows are plain objects. `ctx.db.transaction(tx => …)` gives `tx.sql`, and `ctx.db.driver` is the real driver. `weft db generate <name>` starts a file in `migrations/`; write the SQL by hand. Validate input with your own Zod schemas.' },
    map: [{ want: 'Change the database', call: '`weft db generate <name>`, then write the SQL in `migrations/`', have: 'no ORM' }],
  }),
})

export default native
