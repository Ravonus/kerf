import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { loadConfig } from './load-config.mjs'

/** The app's data layer: the plugin that declares one, or Drizzle, which is built in. Null with no database. */
export async function dbLayer(root, loaded) {
  const { contributions = [] } = loaded ?? (await loadConfig(root))
  const plugin = contributions.find((c) => c.manifest.db)?.manifest.db
  if (plugin) return plugin
  // Drizzle has no plugin to say so: its config file, or a client from `@kerf-js/start/db/*`, does.
  const entry = join(root, 'src/db/index.server.ts')
  return existsSync(join(root, 'drizzle.config.ts')) ||
    (existsSync(entry) && readFileSync(entry, 'utf8').includes('@kerf-js/start/db/'))
    ? DRIZZLE
    : null
}

const DRIZZLE = {
  layer: 'drizzle',
  schema: 'src/db/schema.ts',
  migrations: 'drizzle',
  generate(root) {
    let bin
    try {
      const req = createRequire(join(root, 'package.json'))
      bin = join(dirname(req.resolve('drizzle-kit')), 'bin.cjs')
    } catch {
      throw Object.assign(new Error('drizzle-kit is not installed in this project'), {
        code: 'E_USAGE',
      })
    }
    const r = spawnSync(process.execPath, [bin, 'generate'], { cwd: root, encoding: 'utf8' })
    if (r.status !== 0)
      throw Object.assign(new Error(`drizzle-kit generate failed:\n${r.stdout}${r.stderr}`), {
        code: 'E_INTERNAL',
      })
    return r.stdout.trim()
  },
}
