// An app is a folder holding app.json; everything a manifest leaves out is worked out from each variant's package.json.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = fileURLToPath(new URL('..', import.meta.url))
export const stacks = JSON.parse(readFileSync(join(here, 'stacks.json'), 'utf8'))

const LOCKS = [['pnpm-lock.yaml', 'pnpm'], ['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['yarn.lock', 'yarn'], ['package-lock.json', 'npm']]
const INSTALL = { npm: ['npm', 'ci'], pnpm: ['pnpm', 'install', '--frozen-lockfile'], bun: ['bun', 'install', '--frozen-lockfile'], yarn: ['yarn', 'install', '--frozen-lockfile'] }

/** The apps `--all` means: every folder beside this file with an app.json. */
export const allApps = () => readdirSync(here).filter(d => existsSync(join(here, d, 'app.json')))

function manifestFile(target) {
  for (const f of [join(here, target, 'app.json'), resolve(target, 'app.json'), resolve(target)]) if (existsSync(f) && statSync(f).isFile()) return f
  throw new Error(`no app "${target}": give a name under evals/apps, a folder holding app.json, or the path to one`)
}

const expand = (p, from) => { const q = p.replace(/^~(?=\/|$)/, process.env.BENCH_HOME ?? homedir()); return isAbsolute(q) ? q : resolve(from, q) }

/** The first stack whose `detect` packages are all in package.json: stacks.json goes most specific first. */
export function detect(pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  return stacks.find(s => s.detect.every(d => d in deps)) ?? { id: 'unknown', label: 'unknown', family: 'other', detect: [], out: ['dist'] }
}

function resolveVariant(name, spec, app, dir) {
  const path = expand(spec.path ?? name, dir), cwd = spec.cwd ?? '.', root = join(path, cwd)
  if (!existsSync(join(root, 'package.json'))) throw new Error(`${app}/${name}: no package.json in ${root}`)
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const found = spec.stack ? stacks.find(s => s.id === spec.stack) : detect(pkg)
  if (!found) throw new Error(`${app}/${name}: stack "${spec.stack}" isn't in stacks.json`)
  const stack = { ...found, ...spec.overrides }
  const pm = spec.pm ?? (pkg.packageManager?.split('@')[0]) ?? LOCKS.find(([f]) => existsSync(join(root, f)))?.[1] ?? 'npm'
  return {
    name, label: spec.label ?? stack.label, path, cwd, pkg, stack, pm, env: spec.env ?? {},
    install: spec.install ?? INSTALL[pm], build: spec.build ?? (pkg.scripts?.build ? `${pm} run build` : 'npx vite build'),
    // A variant with no start script is a static build: bench serves its output, compressed the way a CDN would.
    start: spec.start ?? (pkg.scripts?.start ? `${pm} run start` : null),
    src: spec.src ?? ['src'], publicDir: spec.publicDir ?? 'public', tarballs: stack.family === 'weft',
  }
}

export function loadApp(target) {
  const file = manifestFile(target), dir = dirname(file), m = JSON.parse(readFileSync(file, 'utf8'))
  const pages = m.pages.map(p => (typeof p === 'string' ? { path: p } : p))
  const name = m.name ?? basename(dir)
  const variants = Object.entries(m.variants).map(([v, spec]) => resolveVariant(v, spec, name, dir))
  return { name, label: m.label ?? name, note: m.note, env: m.env ?? {}, setup: m.setup, pages, variants, baseline: m.baseline }
}
