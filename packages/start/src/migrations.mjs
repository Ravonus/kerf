// `drizzle/`'s migrations in journal order (research 28 §2): dev reads them per request, a build embeds them.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function readMigrations(root, dir = 'drizzle') {
  const journal = join(root, dir, 'meta', '_journal.json')
  if (!existsSync(journal)) return []
  return JSON.parse(readFileSync(journal, 'utf8')).entries.map(e => ({ tag: e.tag, sql: readFileSync(join(root, dir, `${e.tag}.sql`), 'utf8') }))
}
