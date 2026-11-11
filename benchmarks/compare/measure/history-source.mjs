// Read pinned Git inputs without changing the benchmark checkout or relabeling compilers.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Cached, read-only access to one repository's historical inputs. */
export class HistoryRepository {
  constructor(root) {
    this.root = root
    this.trees = new Map()
    this.snapshots = new Map()
  }

  git(args) {
    return execFileSync('git', args, {
      cwd: this.root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  }

  resolve(ref) {
    return this.git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])
  }

  parents(ref) {
    return this.git(['show', '-s', '--format=%P', ref]).split(' ').filter(Boolean)
  }

  ancestor(from, to) {
    const r = spawnSync('git', ['merge-base', '--is-ancestor', from, to], { cwd: this.root })
    if (r.status !== 0 && r.status !== 1) throw new Error(String(r.stderr))
    return r.status === 0
  }

  tree(ref) {
    if (!this.trees.has(ref)) {
      const rows = this.git(['ls-tree', '-r', '-l', '-z', ref]).split('\0').filter(Boolean)
      this.trees.set(
        ref,
        rows
          .map((row) => {
            const [head, path] = row.split('\t')
            const [, type, object, size] = head.trim().split(/\s+/)
            return { path, type, object, bytes: Number(size) }
          })
          .filter((entry) => entry.type === 'blob'),
      )
    }
    return this.trees.get(ref)
  }

  blob(object) {
    return execFileSync('git', ['cat-file', 'blob', object], {
      cwd: this.root,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }

  text(ref, path) {
    const entry = this.tree(ref).find((item) => item.path === path)
    return entry ? this.blob(entry.object).toString('utf8') : null
  }

  inputs(ref) {
    if (!this.snapshots.has(ref)) {
      const result = new Map()
      for (const entry of this.tree(ref)) {
        const path = canonicalPath(entry.path),
          group = inputGroup(path)
        if (!group) continue
        const item = result.get(path) ?? { group, files: [], bytes: 0 }
        item.files.push(entry)
        item.bytes += entry.bytes
        result.set(path, item)
      }
      this.snapshots.set(ref, result)
    }
    return this.snapshots.get(ref)
  }
}

/** Renames retain their source identity instead of looking like newly added code. */
export function canonicalPath(path) {
  return path
    .replace(/^packages\/ui-core\//, 'packages/veneer-core/')
    .replace(/^packages\/kerf\//, 'packages/core/')
    .replace(/^evals\/compare\//, 'benchmarks/compare/')
}

/** Source categories are separate from archived emitted/compressed measurements. */
export function inputGroup(path) {
  if (/^docs\/design\/veneer\/tokens\/.*\.css$/.test(path)) return 'canonical-css'
  if (/^packages\/veneer-core\/styles\/.*\.css$/.test(path)) return 'generated-css'
  if (/^packages\/veneer\/src\/.*\.css$/.test(path)) return 'veneer-css'
  if (/^crates\/kerf-compiler\/(src\/|Cargo\.|build.rs|rust-toolchain)/.test(path))
    return 'compiler'
  const manifest =
    '(package(-lock)?\\.json|pnpm-lock\\.yaml|pnpm-workspace\\.yaml|\\.nvmrc|\\.npmrc)'
  if (
    new RegExp(
      `^${manifest}$|^packages/(core|veneer|veneer-core)/${manifest}$|^benchmarks/compare/((kerf-veneer|kerf-plain|solid-kobalte|react-radix|react-zustand|react-mui)/)?${manifest}$`,
    ).test(path)
  )
    return 'dependencies'
  if (!/\.[cm]?[jt]sx?$/.test(path)) return null
  if (path.startsWith('packages/veneer/src/')) return 'veneer-js'
  if (/^packages\/veneer-core\/(src|bindings)\//.test(path)) return 'veneer-core-js'
  if (path.startsWith('packages/core/src/')) return 'core-js'
  if (/^packages\/core\/(node|vite|compiler)/.test(path)) return 'build-js'
  if (
    /^benchmarks\/compare\/(measure|shared\/|(kerf-veneer|kerf-plain|solid-kobalte|react-radix|react-zustand|react-mui)\/)/.test(
      path,
    )
  )
    return 'scenario'
  return null
}

/** Git blob-size deltas telescope across merge edges; they are not Brotli deltas. */
export function sourceDelta(repo, from, to) {
  const before = repo.inputs(from),
    after = repo.inputs(to),
    files = [],
    totals = {}
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(path),
      b = after.get(path)
    if (JSON.stringify(a?.files) === JSON.stringify(b?.files)) continue
    const group = (b ?? a).group,
      delta = (b?.bytes ?? 0) - (a?.bytes ?? 0)
    totals[group] = (totals[group] ?? 0) + delta
    files.push({ path, group, delta, before: a?.files ?? [], after: b?.files ?? [] })
  }
  return { totals, files }
}

const fixed = ['Cargo.toml', 'Cargo.lock', 'build.rs', 'rust-toolchain.toml']
const comparePaths = (a, b) => {
  const left = a.path.split('/'),
    right = b.path.split('/')
  for (let n = 0; n < Math.min(left.length, right.length); n++)
    if (left[n] !== right[n]) return left[n] < right[n] ? -1 : 1
  return left.length - right.length
}

/** Match native-stamp.cjs, including directory-before-similarly-named-file ordering. */
export function stampCompilerFiles(files) {
  const hash = createHash('sha256')
  const ordered = [
    ...fixed.flatMap((path) => files.filter((file) => file.path === path)),
    ...files.filter((file) => file.path.startsWith('src/')).sort(comparePaths),
  ]
  if (!ordered.some((file) => file.path === 'src/lib.rs'))
    throw new Error('Missing compiler source')
  for (const file of ordered) hash.update(file.path).update('\0').update(file.data).update('\0')
  return hash.digest('hex')
}

/** Fingerprint the historical compiler source without executing historical JavaScript. */
export function compilerInputs(repo, ref) {
  const prefix = 'crates/kerf-compiler/'
  const files = repo
    .tree(ref)
    .filter((file) => file.path.startsWith(prefix))
    .map((file) => ({ ...file, path: file.path.slice(prefix.length) }))
    .filter((file) => fixed.includes(file.path) || file.path.startsWith('src/'))
  const stamp = stampCompilerFiles(
    files.map((file) => ({ path: file.path, data: repo.blob(file.object) })),
  )
  return { stamp, files }
}

/** Inventory only explicit artifact roots; a different source stamp is never accepted. */
export function nativeArtifacts(dirs) {
  return dirs.flatMap((dir) =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => /\.(node|wasm)$/.test(name))
          .map((name) => {
            const path = join(dir, name),
              sidecar = `${path}.stamp`
            return {
              path,
              stamp: existsSync(sidecar) ? readFileSync(sidecar, 'utf8').trim() : null,
              sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
            }
          })
      : [],
  )
}

/** A blocked historical build must name its expected and available source stamps. */
export function requireArtifacts(expected, available) {
  const missing = expected.filter((item) => !available.some((file) => file.stamp === item.stamp))
  if (missing.length)
    throw new Error(
      `Missing compiler source stamps: ${missing.map((item) => `${item.ref}:${item.stamp}`).join(', ')}; available: ${available.map((item) => item.stamp).join(', ')}`,
    )
}
