// Copy a variant out of its folder (read only), install, and build it in the work area. Weft variants always go through
// local.mjs, so they're on tarballs of this checkout whatever their package.json says.
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { here } from './app.mjs'
import { spread } from './stats.mjs'

const repo = join(here, '../..')
export const localMjs = join(repo, 'packages/create-weft/scripts/local.mjs')

// Never copied: a real env file or anything else that can hold a credential, and any build or dependency folder.
const SECRET = /(^|\/)(\.env(\.(?!example$)[^/]*)?|netlify\.env|\.neon|\.mcp\.json|[^/]*\.pem)$/
const SKIP = /(^|\/)(\._[^/]*|node_modules|\.git|\.next|\.output|\.vinxi|\.nitro|\.netlify|\.vercel|\.claude|dist)(\/|$)/

function files(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'ls-files', '-co', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean)
  } catch {
    const out = [], walk = d => { for (const e of readdirSync(join(dir, d))) { const r = d ? `${d}/${e}` : e; if (SKIP.test(r)) continue; lstatSync(join(dir, r)).isDirectory() ? walk(r) : out.push(r) } }
    walk('')
    return out
  }
}

/** The work folder gets exactly the source: leftovers go, only node_modules stays for a faster install. */
function copy(v, to) {
  mkdirSync(to, { recursive: true })
  const clear = (d, keep) => { for (const e of readdirSync(d)) { if (keep(e)) continue; rmSync(join(d, e), { recursive: true, force: true }) } }
  clear(to, e => e === 'node_modules' || e === v.cwd.split('/')[0])
  if (v.cwd !== '.') { mkdirSync(join(to, v.cwd), { recursive: true }); clear(join(to, v.cwd), e => e === 'node_modules') }
  let n = 0
  for (const f of files(v.path)) {
    if (SECRET.test(f) || SKIP.test(f) || !existsSync(join(v.path, f))) continue
    mkdirSync(dirname(join(to, f)), { recursive: true })
    copyFileSync(join(v.path, f), join(to, f))
    n++
  }
  return n
}

export function run(cmd, { cwd, env, log }) {
  const start = performance.now()
  return new Promise((ok, no) => {
    const out = createWriteStream(log, { flags: 'a' })
    out.write(`\n$ ${cmd}\n`)
    const child = spawn(cmd, { cwd, env: { ...process.env, ...env }, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.pipe(out, { end: false }); child.stderr.pipe(out, { end: false })
    child.on('close', code => { out.end(); code ? no(new Error(`\`${cmd}\` failed in ${cwd} (exit ${code}), see ${log}`)) : ok(performance.now() - start) })
  })
}

const sha = b => createHash('sha256').update(b).digest('hex')
function walk(dir, each) { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'cache' && e.name !== 'node_modules' && e.name !== 'server') walk(p, each) } else if (e.isFile()) each(p) } }

/** What this build can legitimately serve: every output file by content, so a served asset either matches or isn't ours. */
function fingerprint(root, v) {
  const hashes = new Set(), newest = []
  for (const d of [...v.stack.out, v.publicDir]) if (existsSync(join(root, d))) walk(join(root, d), f => { if (/\.(js|mjs|css)$/.test(f)) hashes.add(sha(readFileSync(f))); newest.push(f) })
  return { hashes, files: newest.length }
}

/** The installed `weft` has to be the tarball, byte for byte, or the run is measuring some older checkout. */
function installedIsPacked(root, store) {
  const tarballs = JSON.parse(readFileSync(join(store, 'tarballs.json'), 'utf8')), tgz = tarballs.weft.replace(/^file:/, '')
  const tmp = mkdtempSync(join(tmpdir(), 'bench-tgz-'))
  try {
    execFileSync('tar', ['-xzf', tgz, '-C', tmp])
    let n = 0, wrong = []
    walk(join(tmp, 'package'), f => { const r = relative(join(tmp, 'package'), f), i = join(root, 'node_modules/weft', r); n++; if (r !== 'package.json' && (!existsSync(i) || sha(readFileSync(f)) !== sha(readFileSync(i)))) wrong.push(r) })
    if (wrong.length) throw new Error(`node_modules/weft doesn't match the packed tarball: ${wrong.slice(0, 3).join(', ')}`)
    return { tgz: sha(readFileSync(tgz)).slice(0, 12), files: n }
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

/** Point a Vite config at hidden sourcemaps by wrapping it, leaving the app's config itself as it is. */
function wrapViteConfig(root) {
  const name = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'].find(f => existsSync(join(root, f)))
  if (!name) { writeFileSync(join(root, 'vite.config.mjs'), `export default { build: { sourcemap: 'hidden' } }\n`); return }
  const moved = name.replace('vite.config', 'vite.config.bench-base')
  if (existsSync(join(root, moved))) return
  renameSync(join(root, name), join(root, moved))
  writeFileSync(join(root, name), `import base from './${moved}'
export default async (env) => { const c = typeof base === 'function' ? await base(env) : await base; return { ...c, build: { ...c.build, sourcemap: 'hidden' } } }\n`)
}

/** Next emits maps from one config switch; the same trick as above. */
function wrapNextConfig(root) {
  const name = ['next.config.js', 'next.config.mjs'].find(f => existsSync(join(root, f)))
  if (!name) return
  const moved = name.replace('next.config', 'next.config.bench-base')
  if (existsSync(join(root, moved))) return
  renameSync(join(root, name), join(root, moved))
  writeFileSync(join(root, name), `import base from './${moved}'\nexport default { ...base, productionBrowserSourceMaps: true }\n`)
}

/** Everything this checkout's tarballs are made from: HEAD's trees, plus whatever isn't committed. */
function weftInputs() {
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 })
  const h = createHash('sha256').update(git('rev-parse', 'HEAD:packages', 'HEAD:crates')).update(git('diff', 'HEAD', '--', 'packages', 'crates'))
  for (const f of git('ls-files', '-o', '--exclude-standard', '--', 'packages', 'crates').split('\n').filter(Boolean)) h.update(f).update(readFileSync(join(repo, f)))
  return h.digest('hex')
}

/** One pack per checkout state, however many variants and runs: the tarballs only change when the packages do. */
export async function packOnce(store, log) {
  const inputs = weftInputs(), stamp = join(store, 'inputs')
  mkdirSync(store, { recursive: true })
  if (existsSync(stamp) && existsSync(join(store, 'tarballs.json')) && readFileSync(stamp, 'utf8') === inputs) return { inputs, packed: false }
  await run(`${JSON.stringify(process.execPath)} ${JSON.stringify(localMjs)} pack`, { cwd: repo, env: { WEFT_LOCAL_DIR: store, npm_config_min_release_age: '0' }, log })
  writeFileSync(stamp, inputs)
  return { inputs, packed: true }
}

/** What decides a build's output. Same key, same build: it's reused rather than made again. */
function buildKey(v, app, weft) {
  const h = createHash('sha256').update(JSON.stringify([process.version, v.stack, v.install, v.build, v.env, app.env, app.setup, v.tarballs && weft, ...(app.db ? [app.db.hash] : [])]))
  for (const f of files(v.path).filter(f => !SECRET.test(f) && !SKIP.test(f) && existsSync(join(v.path, f))).sort()) h.update(f).update(readFileSync(join(v.path, f)))
  return h.digest('hex')
}

const FOR_MAPS = '.bench-maps'

/** Copy, env, canary, install, cold builds and the sourcemap build, unless a build with the same key is already there. */
export async function prepare(app, v, { work, runId, store, weft, buildRuns, rebuild, quick = false }) {
  const dir = join(work, 'apps', app.name, v.name), root = join(dir, v.cwd), log = join(work, 'apps', app.name, `${v.name}.log`)
  mkdirSync(dirname(log), { recursive: true }); rmSync(log, { force: true })
  v.dir = dir; v.root = root; v.log = log
  v.buildEnv = { NEXT_TELEMETRY_DISABLED: '1', SKIP_ENV_VALIDATION: '1', ...app.env, ...v.env, ...v.dbEnv }
  const key = buildKey(v, app, weft), stamp = join(work, 'apps', app.name, `${v.name}.build.json`)
  if (!rebuild && existsSync(stamp)) {
    const b = JSON.parse(readFileSync(stamp, 'utf8'))
    // A quick build (one, no maps, from e2e.mjs) serves another quick use and never a bench run.
    if (b.key === key && existsSync(root) && (quick || !b.quick)) {
      v.canary = b.canary; v.weft = b.weft; v.maps = b.maps
      v.fresh = fingerprint(root, v)
      if (b.hashes === sha([...v.fresh.hashes].sort().join())) return { build: b.build, reused: true, key }
    }
  }
  rmSync(stamp, { force: true })
  copy(v, dir)
  if (existsSync(join(root, '.env.example'))) copyFileSync(join(root, '.env.example'), join(root, '.env'))
  mkdirSync(join(root, v.publicDir), { recursive: true })
  v.canary = `__bench-${runId}.txt`
  writeFileSync(join(root, v.publicDir, v.canary), runId)

  const env = { ...process.env, ...v.buildEnv, npm_config_min_release_age: '0', WEFT_LOCAL_DIR: store }
  delete env.NODE_ENV
  if (v.tarballs) {
    await run(`${JSON.stringify(process.execPath)} ${JSON.stringify(localMjs)} refresh . --packed`, { cwd: root, env, log })
    v.weft = installedIsPacked(root, store)
  } else await run(v.install.join(' '), { cwd: root, env, log })
  if (app.setup) await run(app.setup, { cwd: root, env, log })
  const build = await buildAll(v, quick ? 1 : buildRuns)
  v.maps = quick ? null : await buildWithMaps(v)
  writeFileSync(stamp, JSON.stringify({ key, quick, canary: v.canary, weft: v.weft, maps: v.maps, build, hashes: sha([...v.fresh.hashes].sort().join()) }))
  return { build, reused: false, key }
}

/** The last build of a variant as it stands, whatever its key: for `e2e.mjs --no-build`. */
export function lastBuild(app, v, { work }) {
  const dir = join(work, 'apps', app.name, v.name), stamp = join(work, 'apps', app.name, `${v.name}.build.json`)
  if (!existsSync(stamp)) throw new Error(`${app.name}/${v.name} has no build in ${work}: leave out --no-build`)
  const b = JSON.parse(readFileSync(stamp, 'utf8'))
  v.dir = dir; v.root = join(dir, v.cwd); v.log = join(work, 'apps', app.name, `${v.name}.log`); v.canary = b.canary
  v.buildEnv = { ...app.env, ...v.env, ...v.dbEnv }
  v.fresh = fingerprint(v.root, v)
}

const clean = (root, v) => { for (const d of [...v.stack.out, 'node_modules/.vite', 'node_modules/.cache']) rmSync(join(root, d), { recursive: true, force: true }) }

/** Cold builds: a run's first build isn't privileged by a cache the others lack. The last one is the build measured. */
async function buildAll(v, runs) {
  const times = []
  for (let i = 0; i < runs; i++) {
    clean(v.root, v)
    times.push(await run(v.build, { cwd: v.root, env: { NODE_ENV: 'production', ...v.buildEnv }, log: v.log }))
  }
  v.fresh = fingerprint(v.root, v)
  if (!v.fresh.hashes.size) throw new Error(`${v.name}: the build left no JS or CSS in ${v.stack.out.join(', ')}`)
  return spread(times)
}

/**
 * One more build with hidden maps, for attribution only, with the measured output set aside and put back: same hashes or
 * it's reported as a mismatch. Chunks and maps are kept in .bench-maps for later runs that reuse this build.
 */
async function buildWithMaps(v) {
  if (!v.stack.sourcemap) return null
  const measured = v.fresh.hashes, aside = join(v.root, '.bench-aside'), config = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs', 'next.config.js', 'next.config.mjs'].filter(f => existsSync(join(v.root, f)))
  const originals = config.map(f => [f, readFileSync(join(v.root, f))])
  rmSync(aside, { recursive: true, force: true }); mkdirSync(aside)
  const held = v.stack.out.filter(d => existsSync(join(v.root, d)))
  for (const d of held) renameSync(join(v.root, d), join(aside, d))
  try {
    ;({ vite: wrapViteConfig, next: wrapNextConfig })[v.stack.sourcemap](v.root)
    await run(v.build, { cwd: v.root, env: { NODE_ENV: 'production', ...v.buildEnv }, log: v.log })
    const keep = join(v.root, FOR_MAPS)
    rmSync(keep, { recursive: true, force: true }); mkdirSync(keep)
    const maps = []
    for (const d of held) if (existsSync(join(v.root, d))) walk(join(v.root, d), f => { if (/\.m?js\.map$/.test(f)) { const js = f.replace(/\.map$/, ''); if (existsSync(js)) { const to = join(keep, `${basename(dirname(f))}__${basename(f)}`); copyFileSync(f, to); copyFileSync(js, to.replace(/\.map$/, '')); maps.push(to) } } })
    const same = [...fingerprint(v.root, v).hashes].filter(h => measured.has(h)).length
    return { maps, same, total: measured.size }
  } finally {
    for (const d of held) { rmSync(join(v.root, d), { recursive: true, force: true }); renameSync(join(aside, d), join(v.root, d)) }
    rmSync(aside, { recursive: true, force: true })
    for (const f of readdirSync(v.root)) if (f.includes('.bench-base')) rmSync(join(v.root, f), { force: true })
    for (const f of ['vite.config.mjs']) if (!originals.some(([n]) => n === f)) rmSync(join(v.root, f), { force: true })
    for (const [f, b] of originals) writeFileSync(join(v.root, f), b)
  }
}

export function linesOfCode(v) {
  let n = 0
  const count = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) count(p); else if (/\.(tsx?|jsx?|mjs|css)$/.test(e.name)) n += readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).length } }
  for (const s of v.src) if (existsSync(join(v.root, s))) count(join(v.root, s))
  return n
}

export const repoState = () => {
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim()
  return { commit: process.env.BENCH_COMMIT ?? git('rev-parse', '--short', 'HEAD'), dirty: !!git('status', '--porcelain', '--', 'packages', 'crates') }
}
