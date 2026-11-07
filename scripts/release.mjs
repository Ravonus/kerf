#!/usr/bin/env node
// Builds, checks and publishes weft's packages. It only reads the tree: each package is packed, its manifest made fit for
// a registry (sibling `file:` deps become versions, dev-only fields go), and that tarball is what gets checked and sent.
//
//   node scripts/release.mjs                         build, stage, check, then `npm publish --dry-run` each. Nothing leaves.
//   node scripts/release.mjs --publish               the same, then really publish to npmjs.org. You approve in a browser.
//   node scripts/release.mjs --publish --otp         the same, but one 6-digit code from your authenticator app covers
//                                                    every package (it asks again only if the code runs out part way)
//   node scripts/release.mjs --publish --registry http://localhost:4873/    publish to a local registry instead
//
//   --out <dir>       where tarballs go (default .release/, gitignored)
//   --no-build        use the wasm, text and platform builds already on disk
//
// Platform packages come from packages/core/dist/platform/<name>/ (scripts/build-platform.mjs). A platform that isn't
// there is left out of the core's optionalDependencies, and that platform runs the WASM build.
//
// A publish that stops part way is safe to run again: versions already on the registry are skipped.
import { repoRoot } from './lib/helpers.mjs'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { SECRET, STRAY } from './quality/stray.mjs'

const root = repoRoot
const argv = process.argv.slice(2)
const flag = (name) =>
  argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined
const publish = argv.includes('--publish')
const registry = flag('registry') ?? 'https://registry.npmjs.org/'
const local = !registry.includes('registry.npmjs.org')
const useOtp = argv.includes('--otp')
let otp
/** One line from the terminal, even with stdin redirected. */
const ask = (prompt) =>
  execFileSync('bash', ['-c', `read -r -p "${prompt}" a </dev/tty >/dev/tty; echo "$a"`], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  }).trim()
const out = resolve(flag('out') ?? join(root, '.release'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm' // the registry: view, and publish with its passkey approval
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const run = (cmd, args, cwd, stdio = 'pipe') =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio, shell: process.platform === 'win32' })
const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
const say = (line) => console.log(`[release] ${line}`)

const { platforms } = createRequire(import.meta.url)(join(root, 'packages/core/platforms.cjs'))
const platformDir = (name) => join(root, 'packages/core/dist/platform', name)

/** Every package that goes out, with its directory. Platform packages are the ones built. */
function discover() {
  const list = []
  for (const dir of readdirSync(join(root, 'packages'))) {
    const file = join(root, 'packages', dir, 'package.json')
    if (!existsSync(file)) continue
    const pkg = read(file)
    if (!pkg.private) list.push({ dir: join(root, 'packages', dir), pkg })
  }
  for (const p of platforms)
    if (existsSync(join(platformDir(p.name), 'package.json')))
      list.push({
        dir: platformDir(p.name),
        pkg: read(join(platformDir(p.name), 'package.json')),
        platform: p.name,
      })
  return list
}

/** Packages each depends on come first, so nothing is ever on a registry ahead of what it needs. */
function order(list) {
  const byName = new Map(list.map((p) => [p.pkg.name, p]))
  const done = new Set(),
    sorted = []
  const visit = (p, trail = []) => {
    if (done.has(p.pkg.name)) return
    if (trail.includes(p.pkg.name))
      throw new Error(`dependency cycle: ${[...trail, p.pkg.name].join(' > ')}`)
    for (const group of ['optionalDependencies', 'dependencies', 'peerDependencies'])
      for (const name of Object.keys(p.pkg[group] ?? {}))
        if (byName.has(name)) visit(byName.get(name), [...trail, p.pkg.name])
    done.add(p.pkg.name)
    sorted.push(p)
  }
  for (const p of list) visit(p)
  return sorted
}

function build() {
  say('building the WASM compiler')
  run('node', ['scripts/build-wasm.mjs', '--if-stale'], join(root, 'packages/core'), 'inherit')
}

/** The manifest a registry should have. */
function published(pkg, names, version) {
  const ours = (name) => names.has(name) || name.startsWith('@weft-js/')
  const pin = (deps, range) =>
    deps &&
    Object.fromEntries(
      Object.entries(deps)
        .filter(([name]) => !name.startsWith('@weft-js/compiler-') || names.has(name))
        .map(([name, spec]) => [name, ours(name) ? range : spec]),
    )
  const { devDependencies: _dev, scripts: _scripts, ...rest } = pkg
  return {
    ...rest,
    dependencies: pin(pkg.dependencies, version),
    optionalDependencies: pin(pkg.optionalDependencies, version),
    peerDependencies: pin(pkg.peerDependencies, `^${version}`),
  }
}

/** Pack in place (its `prepack` runs), rewrite the manifest in a copy, pack that with no scripts. */
function stage(item, names, version, work) {
  const tmp = mkdtempSync(join(work, 'pack-'))
  const packed = basename(
    JSON.parse(run(pnpm, ['pack', '--json', '--pack-destination', tmp], item.dir)).filename,
  )
  run('tar', ['xzf', packed], tmp)
  const dir = join(tmp, 'package')
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify(published(read(join(dir, 'package.json')), names, version), null, 2)}\n`,
  )
  const file = basename(
    JSON.parse(run(pnpm, ['pack', '--json', '--ignore-scripts', '--pack-destination', out], dir))
      .filename,
  )
  rmSync(tmp, { recursive: true })
  return join(out, file)
}

const BUILTIN = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])

/** Everything wrong with one tarball. `names` is what's being published. */
function check(tgz, names, version) {
  const bad = []
  const dir = mkdtempSync(join(tmpdir(), 'weft-check-'))
  run('tar', ['xzf', tgz], dir)
  const base = join(dir, 'package')
  const pkg = read(join(base, 'package.json'))
  const files = readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile())
    .map((f) => relative(base, join(f.parentPath, f.name)).split(sep).join('/'))
  const has = new Set(files)
  if (pkg.version !== version) bad.push(`version is ${pkg.version}, not ${version}`)
  if (pkg.private) bad.push('still private')
  if (pkg.repository) bad.push('names a repository: the repo is private')
  if (!pkg.license) bad.push('no license')
  if (!has.has('README.md')) bad.push('no README')
  if (pkg.publishConfig?.access !== 'public') bad.push('publishConfig.access is not public')
  if (!pkg.name.startsWith('@weft-js/compiler-') && !has.has('LICENSE')) bad.push('no LICENSE')
  for (const group of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, spec] of Object.entries(pkg[group] ?? {})) {
      if (/^(file|link|workspace):/.test(spec)) bad.push(`${group}: ${name} is ${spec}`)
      if (name.startsWith('@weft-js/') && !names.has(name))
        bad.push(`${group}: ${name} isn't published`)
    }
  }
  for (const f of files) for (const [re, what] of STRAY) if (re.test(f)) bad.push(`${f} is ${what}`)
  const exportTargets = (value) =>
    typeof value === 'string'
      ? [value]
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(exportTargets)
        : []
  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    for (const target of exportTargets(value)) {
      if (target.includes('*')) {
        if (!files.some((f) => f.startsWith(target.slice(2).split('*')[0])))
          bad.push(`export ${key}: nothing at ${target}`)
      } else if (!has.has(target.slice(2))) bad.push(`export ${key}: no ${target}`)
    }
  }
  for (const target of Object.values(pkg.bin ?? {}))
    if (!has.has(target.replace(/^\.\//, ''))) bad.push(`bin: no ${target}`)
  const declared = new Set(
    Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies }),
  )
  const undeclared = new Set()
  for (const f of files.filter((x) => /\.([cm]?js|[cm]?ts|tsx|jsx)$/.test(x))) {
    const text = readFileSync(join(base, f), 'utf8')
    if (SECRET.test(text)) bad.push(`${f} looks like it holds a secret`)
    if (/agorix/i.test(text)) bad.push(`${f} mentions the old name`)
    if (/github\.com\/Ravonus/.test(text)) bad.push(`${f} links the private repo`)
    if (f.startsWith('templates/')) continue // files a scaffold copies into an app: their imports are the app's
    const code = text.replace(/^\s*(?:\/\/|\/?\*).*$/gm, '')
    for (const m of code.matchAll(
      /^(?:import|export)\s+(?!type\b)[^'"\n`]*from\s+['"]([^'"]+)['"]/gm,
    )) {
      const spec = m[1]
      if ((code.slice(0, m.index).match(/(?<!\\)`/g)?.length ?? 0) % 2) continue // text a scaffold writes, not an import
      if (spec.startsWith('.')) {
        const at = join(dirname(f), spec).split(sep).join('/')
        if (
          !['', '.ts', '.tsx', '.mjs', '.js', '.d.ts', '/index.ts', '/index.tsx'].some((e) =>
            has.has(at + e),
          )
        )
          bad.push(`${f} imports ${spec}, which isn't shipped`)
      } else if (!BUILTIN.has(spec) && !spec.startsWith('#') && !spec.includes(':')) {
        const name = spec
          .split('/')
          .slice(0, spec.startsWith('@') ? 2 : 1)
          .join('/')
        if (name !== pkg.name && !declared.has(name)) undeclared.add(name)
      }
    }
  }
  for (const name of undeclared) bad.push(`imports ${name} without declaring it`)
  const size = statSync(tgz).size
  rmSync(dir, { recursive: true })
  return { bad, name: pkg.name, entries: files.length, size }
}

const isUp = (name, version) =>
  spawnSync(npm, ['view', `${name}@${version}`, 'version', '--registry', registry], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).stdout.trim() === version

/** Exits non-zero on the first refusal: everything after it depends on it. */
function send(tgz, name, version) {
  if (isUp(name, version)) return say(`${name}@${version} is already up`)
  if (useOtp && publish && !otp) otp = ask('6-digit code from your authenticator app: ')
  const auth = local ? [] : useOtp ? [`--otp=${otp}`] : ['--auth-type=web']
  const r = spawnSync(
    npm,
    [
      'publish',
      tgz,
      '--access',
      'public',
      '--tag',
      version.includes('-') ? 'next' : 'latest',
      '--registry',
      registry,
      '--ignore-scripts',
      ...auth,
      ...(publish ? [] : ['--dry-run']),
    ],
    {
      stdio: ['inherit', 'inherit', 'pipe'],
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  )
  process.stderr.write(r.stderr ?? '')
  if (r.status !== 0 && useOtp && /EOTP/.test(r.stderr ?? '')) {
    otp = undefined
    return send(tgz, name, version)
  } // the code ran out: ask for the next one
  if (r.status !== 0)
    throw new Error(
      `${name}: npm publish failed. Fix it and run this again: what's already up is skipped.`,
    )
}

// ---- run ----

const list = order(discover())
const versions = new Set(list.map((p) => p.pkg.version))
if (versions.size !== 1) throw new Error(`more than one version: ${[...versions].join(', ')}`)
const [version] = versions
if (!argv.includes('--no-build')) build()
const shipped = platforms.filter((p) => list.some((i) => i.platform === p.name)).map((p) => p.name)
const skipped = platforms.map((p) => p.name).filter((n) => !shipped.includes(n))
say(
  `${list.length} packages at ${version}. Prebuilt compiler for: ${shipped.join(', ') || 'none'}. WASM only: ${skipped.join(', ') || 'none'}.`,
)

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const work = mkdtempSync(join(tmpdir(), 'weft-release-'))
const names = new Set(list.map((p) => p.pkg.name))
const staged = list.map((item) => ({ ...item, tgz: stage(item, names, version, work) }))
rmSync(work, { recursive: true })

let failed = 0
for (const item of staged) {
  const { bad, name, entries, size } = check(item.tgz, names, version)
  say(
    `${name}: ${entries} files, ${(size / 1024).toFixed(0)} KB${bad.length ? `, ${bad.length} problem(s)` : ''}`,
  )
  for (const line of bad) console.error(`  ${line}`)
  failed += bad.length
}
if (failed) {
  console.error(`[release] ${failed} problem(s): nothing was published.`)
  process.exit(1)
}

say(`order: ${staged.map((i) => i.pkg.name).join(' > ')}`)
if (publish && !local)
  say(
    `publishing ${staged.length} packages to npmjs.org. Each may open a browser for your passkey: tick "don't ask again for 5 minutes" if it's offered.`,
  )
for (const item of staged) send(item.tgz, item.pkg.name, version)
say(
  publish
    ? `published to ${registry}`
    : `dry run finished. Tarballs are in ${out}. Nothing was published; pass --publish to do it.`,
)
