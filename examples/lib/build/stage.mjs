import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { repoRoot } from '../../../scripts/lib/helpers.mjs'
import { quote } from '../serve.mjs'
import { copy } from './copy.mjs'
import { fingerprint, installedIsPacked, sha } from './fingerprint.mjs'
import { run } from './run.mjs'

export const localMjs = join(repoRoot, 'packages/create/scripts/local.mjs')

export function placeVariant(app, v, work) {
  const dir = join(work, 'apps', app.name, v.name),
    log = join(work, 'apps', app.name, `${v.name}.log`)
  mkdirSync(dirname(log), { recursive: true })
  rmSync(log, { force: true })
  v.dir = dir
  v.root = join(dir, v.cwd)
  v.log = log
  v.buildEnv = {
    NEXT_TELEMETRY_DISABLED: '1',
    SKIP_ENV_VALIDATION: '1',
    ...app.env,
    ...v.env,
    ...v.dbEnv,
  }
}

export function reuseStamp({ v, stamp, key, quick }) {
  if (!existsSync(stamp)) return null
  const b = JSON.parse(readFileSync(stamp, 'utf8'))
  // A quick build (one, no maps, from e2e.mjs) serves another quick use and never a bench run.
  if (b.key !== key || !existsSync(v.root) || !(quick || !b.quick)) return null
  v.canary = b.canary
  v.weft = b.weft
  v.maps = b.maps
  v.fresh = fingerprint(v.root, v)
  return b.hashes === sha([...v.fresh.hashes].sort().join()) ? b : null
}

export function stageSource(v, runId) {
  copy(v, v.dir)
  if (existsSync(join(v.root, '.env.example')))
    copyFileSync(join(v.root, '.env.example'), join(v.root, '.env'))
  mkdirSync(join(v.root, v.publicDir), { recursive: true })
  v.canary = `__bench-${runId}.txt`
  writeFileSync(join(v.root, v.publicDir, v.canary), runId)
}

export async function install({ app, v, store }) {
  const { root, log } = v
  const env = {
    ...process.env,
    ...v.buildEnv,
    npm_config_min_release_age: '3',
    WEFT_LOCAL_DIR: store,
  }
  delete env.NODE_ENV
  if (v.tarballs) {
    await run(`${quote(process.execPath)} ${quote(localMjs)} refresh . --packed`, {
      cwd: root,
      env,
      log,
    })
    v.weft = installedIsPacked(root, store)
  } else await run(v.install.join(' '), { cwd: root, env, log })
  if (app.setup) await run(app.setup, { cwd: root, env, log })
}
