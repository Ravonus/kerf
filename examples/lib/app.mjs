// An app is a folder holding app.json; everything a manifest leaves out is worked out from each variant's package.json.
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { benchUser, seedHash } from '../shared/pg/env.mjs'

export const here = fileURLToPath(new URL('..', import.meta.url))
/** Benchmark runs and charts keep their shared history under evaluation results. */
export const historyFile = join(here, '../evals/results/apps-history.jsonl')
export const stacks = JSON.parse(readFileSync(join(here, 'stacks.json'), 'utf8'))

const LOCKS = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]
const INSTALL = {
  npm: ['ci'],
  pnpm: ['install', '--frozen-lockfile'],
  bun: ['install', '--frozen-lockfile'],
  yarn: ['install', '--frozen-lockfile'],
}

/** The apps `--all` means: every folder beside this file with an app.json. */
export const allApps = () => readdirSync(here).filter((d) => existsSync(join(here, d, 'app.json')))

function manifestFile(target) {
  for (const f of [join(here, target, 'app.json'), resolve(target, 'app.json'), resolve(target)])
    if (existsSync(f) && statSync(f).isFile()) return f
  throw new Error(
    `no app "${target}": give a name under examples, a folder holding app.json, or the path to one`,
  )
}

const expand = (p, from) => {
  const q = p.replace(/^~(?=\/|$)/, process.env.BENCH_HOME ?? homedir())
  return isAbsolute(q) ? q : resolve(from, q)
}

/** The first stack whose `detect` packages are all in package.json: stacks.json goes most specific first. */
export function detect(pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  return (
    stacks.find((s) => s.detect.every((d) => d in deps)) ?? {
      id: 'unknown',
      label: 'unknown',
      family: 'other',
      detect: [],
      out: ['dist'],
    }
  )
}

/** A `scaffold` variant is what create-weft writes today, regenerated each load, so nothing under examples can fork it. */
function generate(app, name, options) {
  const dir = join(
    process.env.BENCH_WORK ?? join(homedir(), '.cache/weft-app-bench'),
    'gen',
    app,
    name,
  )
  const { scaffold } = createRequire(import.meta.url)(
    join(here, '../packages/create/src/index.mjs'),
  )
  rmSync(dir, { recursive: true, force: true })
  // A fixed secret: the default is random, and would change the build key every load.
  scaffold(dir, { name: app, secret: benchUser.authSecret, ...options })
  return dir
}

function resolveVariant(name, spec, app, dir) {
  const path = spec.scaffold ? generate(app, name, spec.scaffold) : expand(spec.path ?? name, dir),
    cwd = spec.cwd ?? '.',
    root = join(path, cwd)
  if (!existsSync(join(root, 'package.json')))
    throw new Error(`${app}/${name}: no package.json in ${root}`)
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const found = spec.stack ? stacks.find((s) => s.id === spec.stack) : detect(pkg)
  if (!found) throw new Error(`${app}/${name}: stack "${spec.stack}" isn't in stacks.json`)
  const stack = { ...found, ...spec.overrides }
  const pm =
    spec.pm ??
    pkg.packageManager?.split('@')[0] ??
    LOCKS.find(([f]) => existsSync(join(root, f)))?.[1] ??
    'npm'
  return {
    name,
    label: spec.label ?? stack.label,
    path,
    cwd,
    pkg,
    stack,
    pm,
    env: spec.env ?? {},
    // A pinned package manager is used at that version whatever this machine has; `npm run` starts anyone's scripts.
    install: spec.install ?? [
      ...(pkg.packageManager ? ['npx', '-y', pkg.packageManager] : [pm]),
      ...INSTALL[pm],
    ],
    build: spec.build ?? (pkg.scripts?.build ? 'npm run build' : 'npx vite build'),
    // A variant with no start script is a static build: bench serves its output, compressed the way a CDN would.
    start: spec.start ?? (pkg.scripts?.start ? 'npm run start' : null),
    src: spec.src ?? ['src'],
    publicDir: spec.publicDir ?? 'public',
    tarballs: stack.family === 'weft',
  }
}

/** `live` pages need a canary to prove it, `cached` ones are skipped and labelled; a string, or a map of variant to label with `*` as the rest. */
export function freshness(page, variant) {
  const f = page.freshness,
    label = typeof f === 'object' && f ? (f[variant] ?? f['*']) : f
  if (label && label !== 'live' && label !== 'cached')
    throw new Error(`${page.path}: freshness must be live or cached, not "${label}"`)
  if (label === 'live' && !page.canary)
    throw new Error(`${page.path}: freshness "live" needs a canary to prove it`)
  return label ?? (page.canary ? 'live' : 'unchecked')
}

export function loadApp(target, { only } = {}) {
  const file = manifestFile(target),
    dir = dirname(file),
    m = JSON.parse(readFileSync(file, 'utf8'))
  const pages = m.pages.map((p) => (typeof p === 'string' ? { path: p } : p))
  const db = m.db ? { rtt: [2, 40], pool: 10, ...m.db, hash: seedHash() } : undefined
  const login = m.login
    ? { path: '/login', email: 'Email', password: 'Password', submit: 'Sign in', ...m.login }
    : undefined
  const name = m.name ?? basename(dir)
  const variants = Object.entries(m.variants)
    .filter(([v]) => !only || only.includes(v))
    .map(([v, spec]) => resolveVariant(v, spec, name, dir))
  return {
    name,
    label: m.label ?? name,
    note: m.note,
    env: m.env ?? {},
    setup: m.setup,
    pages,
    variants,
    baseline: m.baseline,
    db,
    login,
    race: m.race,
  }
}
