// The app's migrations in order (research 28 §2, 34 §4): dev reads them per request, a build embeds them. `drizzle/` has
// a journal; Native's `migrations/` is numbered `.sql` files; Prisma's `prisma/migrations/` is a folder per migration.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIRS = ['drizzle', 'migrations', 'prisma/migrations']

export function readMigrations(root, dir = DIRS.find((d) => existsSync(join(root, d)))) {
  if (!dir) return []
  const base = join(root, dir)
  const journal = join(base, 'meta', '_journal.json')
  if (existsSync(journal))
    return JSON.parse(readFileSync(journal, 'utf8')).entries.map((e) => ({
      tag: e.tag,
      sql: readFileSync(join(base, `${e.tag}.sql`), 'utf8'),
    }))
  if (!existsSync(base)) return []
  return readdirSync(base)
    .sort()
    .flatMap((name) => {
      const file = name.endsWith('.sql') ? join(base, name) : join(base, name, 'migration.sql')
      return existsSync(file)
        ? [{ tag: name.replace(/\.sql$/, ''), sql: readFileSync(file, 'utf8') }]
        : []
    })
}
