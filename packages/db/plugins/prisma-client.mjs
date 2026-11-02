// prisma() for weft.config.ts (research 34 §4): what the CLI needs from Prisma. `weft db generate` writes the client and
// a migration into `prisma/migrations`. The first needs no database; later ones are Prisma's own diff, which does.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { definePlugin } from 'weft/plugin'

const DIR = 'prisma/migrations'

function run(root, args) {
  let bin
  try {
    bin = join(dirname(createRequire(join(root, 'package.json')).resolve('prisma/package.json')), 'build/index.js')
  } catch {
    throw Object.assign(new Error('prisma is not installed in this project'), { code: 'E_USAGE' })
  }
  const r = spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) throw Object.assign(new Error(`prisma ${args[0]} failed:\n${r.stdout}${r.stderr}`), { code: 'E_INTERNAL' })
  return r.stdout
}

function generate(root, name = 'change') {
  run(root, ['generate'])
  if (existsSync(join(root, DIR))) return run(root, ['migrate', 'dev', '--create-only', '--name', name]).trim()
  const sql = run(root, ['migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'])
  const dir = join(root, DIR, '00000000000000_init')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'migration.sql'), sql)
  return `${DIR}/00000000000000_init/migration.sql`
}

export const prisma = definePlugin({
  name: '@weft/db/plugin-prisma',
  version: '0.0.0',
  weft: '*',
  permissions: { fs: { read: ['prisma/**'], write: ['prisma/migrations/**'] }, spawn: ['node'] },
  contribute: () => ({
    db: { layer: 'prisma', schema: 'prisma/schema.prisma', migrations: DIR, generate },
    agents: { title: 'Database (Prisma)', text: '`ctx.db` is the real Prisma client, so Prisma\'s docs apply. The schema is `prisma/schema.prisma`; after changing it, run `weft db generate <name>`, which updates the client and adds a migration that applies on the next request.' },
    map: [{ want: 'Change the database', call: 'Edit `prisma/schema.prisma`, then `weft db generate <name>`', have: 'Prisma' }],
  }),
})

export default prisma
