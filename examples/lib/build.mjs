// Copy a variant out of its folder (read only), install, and build it in the work area. Weft variants always go through
// local.mjs, so they're on tarballs of this checkout whatever their package.json says.
import { repoRoot } from '../../scripts/lib/helpers.mjs'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { quote } from './serve.mjs'
import { spread } from './stats.mjs'
import { SECRET, SKIP, files } from './build/copy.mjs'
import { fingerprint, sha, weftInputs } from './build/fingerprint.mjs'
import { buildWithMaps } from './build/maps.mjs'
import { linesOfCode, repoState } from './build/repo.mjs'
import { install, localMjs, placeVariant, reuseStamp, stageSource } from './build/stage.mjs'
import { run } from './build/run.mjs'

const repo = repoRoot

/** One pack per checkout state, however many variants and runs: the tarballs only change when the packages do. */
export async function packOnce(store, log) {
  const inputs = weftInputs(),
    stamp = join(store, 'inputs')
  mkdirSync(store, { recursive: true })
  if (
    existsSync(stamp) &&
    existsSync(join(store, 'tarballs.json')) &&
    readFileSync(stamp, 'utf8') === inputs
  )
    return { inputs, packed: false }
  await run(`${quote(process.execPath)} ${quote(localMjs)} pack`, {
    cwd: repo,
    env: { WEFT_LOCAL_DIR: store, npm_config_min_release_age: '3' },
    log,
  })
  writeFileSync(stamp, inputs)
  return { inputs, packed: true }
}

/** What decides a build's output. Same key, same build: it's reused rather than made again. */
function buildKey(v, app, weft) {
  const h = createHash('sha256').update(
    JSON.stringify([
      process.version,
      v.stack,
      v.install,
      v.build,
      v.env,
      app.env,
      app.setup,
      v.tarballs && weft,
      ...(app.db ? [app.db.hash] : []),
    ]),
  )
  for (const f of files(v.path)
    .filter((f) => !SECRET.test(f) && !SKIP.test(f) && existsSync(join(v.path, f)))
    .sort())
    h.update(f).update(readFileSync(join(v.path, f)))
  return h.digest('hex')
}

/** Copy, env, canary, install, cold builds and the sourcemap build, unless a build with the same key is already there. */
export async function prepare(
  app,
  v,
  { work, runId, store, weft, buildRuns, rebuild, quick = false },
) {
  placeVariant(app, v, work)
  const key = buildKey(v, app, weft),
    stamp = join(work, 'apps', app.name, `${v.name}.build.json`)
  const reused = !rebuild && reuseStamp({ v, stamp, key, quick })
  if (reused) return { build: reused.build, reused: true, key }
  rmSync(stamp, { force: true })
  stageSource(v, runId)
  await install({ app, v, store })
  const build = await buildAll(v, quick ? 1 : buildRuns)
  v.maps = quick ? null : await buildWithMaps(v)
  writeFileSync(
    stamp,
    JSON.stringify({
      key,
      quick,
      canary: v.canary,
      weft: v.weft,
      maps: v.maps,
      build,
      hashes: sha([...v.fresh.hashes].sort().join()),
    }),
  )
  return { build, reused: false, key }
}

/** The last build of a variant as it stands, whatever its key: for `e2e.mjs --no-build`. */
export function lastBuild(app, v, { work }) {
  const dir = join(work, 'apps', app.name, v.name),
    stamp = join(work, 'apps', app.name, `${v.name}.build.json`)
  if (!existsSync(stamp))
    throw new Error(`${app.name}/${v.name} has no build in ${work}: leave out --no-build`)
  const b = JSON.parse(readFileSync(stamp, 'utf8'))
  v.dir = dir
  v.root = join(dir, v.cwd)
  v.log = join(work, 'apps', app.name, `${v.name}.log`)
  v.canary = b.canary
  v.buildEnv = { ...app.env, ...v.env, ...v.dbEnv }
  v.fresh = fingerprint(v.root, v)
}

const clean = (root, v) => {
  for (const d of [...v.stack.out, 'node_modules/.vite', 'node_modules/.cache'])
    rmSync(join(root, d), { recursive: true, force: true })
}

/** Cold builds: a run's first build isn't privileged by a cache the others lack. The last one is the build measured. */
async function buildAll(v, runs) {
  const times = []
  for (let i = 0; i < runs; i++) {
    clean(v.root, v)
    times.push(
      await run(v.build, {
        cwd: v.root,
        env: { NODE_ENV: 'production', ...v.buildEnv },
        log: v.log,
      }),
    )
  }
  v.fresh = fingerprint(v.root, v)
  if (!v.fresh.hashes.size)
    throw new Error(`${v.name}: the build left no JS or CSS in ${v.stack.out.join(', ')}`)
  return spread(times)
}

export { linesOfCode, repoState }
