#!/usr/bin/env node
// create-weft <dir> [--ui warp|headless|none] [--db sqlite|postgres|none] [--auth] [--runtime node|bun|deno] [--name <name>]
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DB, RUNTIMES, scaffold, UI } from '../src/index.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, options: { ui: { type: 'string', default: 'warp' }, db: { type: 'string', default: 'none' }, auth: { type: 'boolean', default: false }, runtime: { type: 'string', default: 'node' }, name: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
if (values.help || positionals.length !== 1) {
  console.log(`Usage: create-weft <dir> [--ui ${UI.join('|')}] [--db ${DB.join('|')}] [--auth] [--runtime ${RUNTIMES.join('|')}] [--name <name>]\n\n  --ui warp      the warp kit, wired in through warp() (default)\n  --ui headless  @weft/ui-core's tokens and behaviour under your own markup\n  --ui none      weft and @weft/start only\n  --db sqlite    Drizzle and a todo app on SQLite: no native binary, works on all three runtimes\n  --db postgres  the same on Postgres (DATABASE_URL in .env)\n  --db none      no database (default)\n  --auth         Better Auth: sign-in, sign-up, a guarded /todos (needs --db)\n  --runtime      what \`weft build\` targets (default node)`)
  process.exit(values.help ? 0 : 1)
}
try {
  const dir = resolve(positionals[0])
  const { files } = scaffold(dir, { ui: values.ui, db: values.db, auth: values.auth, runtime: values.runtime, name: values.name })
  console.log(`Created ${files.length} files in ${dir}\n\n  cd ${positionals[0]}\n  npm install${values.db === 'none' ? '' : '\n  npx weft db generate'}\n  npx weft dev`)
} catch (e) {
  console.error(`create-weft: ${e.message}`)
  process.exit(1)
}
