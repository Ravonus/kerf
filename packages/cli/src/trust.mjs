// Plugin trust (PLAN §7c, research 13 §2.9): `.kerf/plugins.lock.json` records what each plugin may do and hashes its
// code, so a change is visible and blocked until `kerf plugins approve`. It is a diff, not a sandbox: `contribute()` has
// already run by the time any of this looks at a plugin, and the audit reads source, which code can hide from.

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { diagnostic, locate } from './diag.mjs'
import { scanFile } from './trust/scan.mjs'

export const lockFile = '.kerf/plugins.lock.json'

const refused = (message) => Object.assign(new Error(message), { code: 'E_TRUST' })
const posix = (p) => p.split(sep).join('/')
/** @param {string[]} list */
const sorted = (list) => [...new Set(list)].sort()

/** Permissions as flat strings, one per grant, so a lock diff reads line by line: `fs.read:fonts/**`, `native`. */
export function grants(p = {}) {
  const each = (kind, list) => (list ?? []).map((v) => `${kind}:${v}`)
  return sorted([
    ...each('fs.read', p.fs?.read),
    ...each('fs.write', p.fs?.write),
    ...each('net', p.net),
    ...each('env', p.env),
    ...each('spawn', p.spawn),
    ...(p.native ? ['native'] : []),
  ])
}

/** The lockfile, or `broken` when it can't be read: an unresolved merge shouldn't read as "nothing approved". */
function readLock(root) {
  const file = join(root, lockFile)
  if (!existsSync(file)) return { found: false, plugins: {} }
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (data?.version !== 1 || typeof data.plugins !== 'object' || data.plugins === null)
      return { found: true, plugins: {}, broken: 'it is not a version 1 lockfile' }
    return { found: true, plugins: data.plugins }
  } catch (error) {
    return { found: true, plugins: {}, broken: String(error.message).split('\n')[0] }
  }
}

/** The package a plugin name is in: `@kerf/db/mongo` is a subpath of `@kerf/db`. */
export const packageOf = (name) =>
  name
    .split('/')
    .slice(0, name.startsWith('@') ? 2 : 1)
    .join('/')

/** Where a plugin is installed: the nearest `node_modules/<package>`, through its symlink. Null for one defined in the config. */
function packageDir(root, name) {
  for (let dir = root; ; dir = dirname(dir)) {
    const at = join(dir, 'node_modules', packageOf(name))
    if (existsSync(join(at, 'package.json'))) return realpathSync(at)
    if (dirname(dir) === dir) return null
  }
}

/** A hash of the package's files, the same from any installer. Its own dependencies are the package manager's lock's job. */
function hashPackage(dir) {
  const hash = createHash('sha512')
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && !relative(dir, f.parentPath).split(sep).includes('node_modules'))
    .map((f) => join(f.parentPath, f.name))
    .sort()
  for (const file of files) {
    const bytes = readFileSync(file)
    hash.update(`${posix(relative(dir, file))}\0${bytes.length}\0`).update(bytes)
  }
  return `sha512-${hash.digest('base64')}`
}

const EXTENSIONS = [
  '',
  '.mjs',
  '.js',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '/index.mjs',
  '/index.js',
  '/index.ts',
]
const sourceFile = /\.(?:[cm]?[jt]s|[jt]sx)$/
const onDisk = (path) =>
  EXTENSIONS.map((e) => path + e).find((p) => sourceFile.test(p) && existsSync(p)) ?? null

/** A package export's file for this runtime. */
function exportTarget(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null
  return exportTarget(value.node ?? value.import ?? value.default ?? value.require)
}

function entryFile(dir, pkg, subpath) {
  const map = pkg.exports
  const keyed = map && typeof map === 'object' && Object.keys(map).some((k) => k.startsWith('.'))
  const target = exportTarget(
    keyed ? map[subpath] : subpath === '.' ? (map ?? pkg.main ?? 'index.js') : null,
  )
  return (
    (target && onDisk(join(dir, target))) ?? (subpath === '.' ? null : onDisk(join(dir, subpath)))
  )
}

/**
 * The plugin's entry, and each module it names for the build or the server (a browser has no `fs` to reach). Only the
 * package's own files are read; `dependencies` says what it stopped at.
 */
export function audit(root, dir, contribution) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  // A package can hold several plugins, `<package>/<sub>/plugin`, and each answers for its own files.
  const sub = contribution.name?.startsWith(`${pkg.name}/`)
    ? contribution.name.slice(pkg.name.length)
    : ''
  const roots = [entryFile(dir, pkg, `.${sub}/plugin`) ?? entryFile(dir, pkg, `.${sub}`)]
  for (const ref of contribution.manifest.provides ?? []) {
    for (const [side, { module }] of Object.entries(ref.sides ?? {})) {
      if (side === 'client') continue
      if (module === pkg.name || module.startsWith(`${pkg.name}/`))
        roots.push(entryFile(dir, pkg, `.${module.slice(pkg.name.length)}`))
      else if (isAbsolute(module) || module.startsWith('.'))
        roots.push(onDisk(isAbsolute(module) ? module : resolve(root, module)))
    }
  }
  const seen = new Set()
  const queue = roots.filter((f) => f && !relative(dir, f).startsWith('..'))
  const uses = []
  /** @type {Set<string>} */
  const dependencies = new Set()
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const found = scanFile(readFileSync(file, 'utf8'), file)
    for (const u of found.uses) uses.push({ ...u, file: posix(relative(dir, file)) })
    for (const name of found.imports) {
      if (!name.startsWith('.')) {
        if (name !== pkg.name && !name.startsWith(`${pkg.name}/`))
          dependencies.add(
            name
              .split('/')
              .slice(0, name.startsWith('@') ? 2 : 1)
              .join('/'),
          )
        continue
      }
      const next = onDisk(resolve(dirname(file), name))
      if (next && !relative(dir, next).startsWith('..')) queue.push(next)
    }
  }
  const granted = grants(contribution.permissions)
  return {
    uses: uses.sort(
      (a, b) => a.need.localeCompare(b.need) || a.file.localeCompare(b.file) || a.line - b.line,
    ),
    undeclared: sorted(uses.map((u) => u.need).filter((need) => !declared(need, granted))),
    dependencies: [...dependencies].sort(),
  }
}

/** Is `need` from the audit covered by what the plugin declared? */
function declared(need, granted) {
  if (need === 'env:*') return granted.some((g) => g.startsWith('env:'))
  if (need.startsWith('env:')) return granted.includes(need) || granted.includes('env:*')
  if (need === 'native') return granted.includes('native')
  const kind = { fs: 'fs.', net: 'net:', spawn: 'spawn:' }[need]
  return granted.some((g) => g.startsWith(kind))
}

/**
 * Every plugin against the lock. A plugin whose code is pinned and unchanged has nothing new to find, so only `full`
 * reads it again; one with nothing to pin (a workspace package) is read every time.
 * @param {{ full?: boolean }} [options]
 */
export function trustStatus(root, loaded, { full = false } = {}) {
  const lock = readLock(root)
  const plugins = loaded.contributions.map((c) => {
    const entry = lock.plugins[c.name] ?? null
    const dir = packageDir(root, c.name)
    const source = !dir
      ? 'config'
      : dir.split(sep).includes('node_modules')
        ? 'package'
        : 'workspace'
    const integrity = source === 'package' ? hashPackage(dir) : null
    const permissions = grants(c.permissions)
    const provides = sorted(
      (c.manifest.provides ?? []).map((p) => (p.key ? `${p.slot.id}[${p.key}]` : p.slot.id)),
    )
    // A scaffold approves permissions before there's an install to hash (`integrity: null`), and that's filled in by `approve`.
    const changed =
      !!entry &&
      (entry.integrity ?? null) !== integrity &&
      !(entry.integrity == null && source === 'package')
    const scanned =
      dir && (full || !entry || !integrity || !entry.integrity || changed)
        ? audit(root, dir, c)
        : null
    const uses = scanned?.uses ?? []
    // Without a scan the lock's own record stands: those are the same files.
    const undeclared = scanned?.undeclared ?? entry?.undeclared ?? []
    const added = permissions.filter((g) => !entry?.permissions?.includes(g))
    const removed = (entry?.permissions ?? []).filter((g) => !permissions.includes(g))
    const hidden = undeclared.filter((need) => !entry?.undeclared?.includes(need))
    return {
      name: c.name,
      version: c.version ?? null,
      source,
      integrity,
      permissions,
      provides,
      uses,
      undeclared,
      dependencies: scanned?.dependencies ?? [],
      locked: !!entry,
      lockedVersion: entry?.version ?? null,
      added,
      removed,
      hidden,
      integrityChanged: changed,
      blocked: added.length > 0 || hidden.length > 0 || changed,
    }
  })
  return {
    lock: lockFile,
    found: lock.found,
    broken: lock.broken,
    plugins,
    stale: Object.keys(lock.plugins)
      .filter((name) => !plugins.some((p) => p.name === name))
      .sort(),
  }
}

/** P109 and P110 for what the lock doesn't cover. `trust: 'warn'` in the config makes them warnings. */
export function trustDiagnostics(root, loaded, status = trustStatus(root, loaded)) {
  const severity = loaded.config.trust === 'warn' ? 'warning' : 'error'
  const rel = loaded.file ? posix(relative(root, loaded.file)) : 'kerf.config.ts'
  const text = loaded.file ? readFileSync(loaded.file, 'utf8') : ''
  const out = []
  const report = (code, name, why, help) =>
    out.push(
      diagnostic({ code, severity, owner: name, file: rel, why, help, ...locate(text, name) }),
    )
  if (status.broken)
    out.push(
      diagnostic({
        code: 'P110',
        severity,
        file: lockFile,
        why: `${lockFile} can't be read: ${status.broken}.`,
        help: 'Fix it, or delete it and approve each plugin again.',
      }),
    )
  for (const p of status.plugins) {
    const approve = `Review it, then run \`kerf plugins approve ${p.name}\`.`
    if (p.added.length)
      report(
        'P109',
        p.name,
        `\`${p.name}\` asks for permissions the lock doesn't give it: ${p.added.join(', ')}.`,
        approve,
      )
    if (p.hidden.length)
      report(
        'P109',
        p.name,
        `\`${p.name}\` uses ${p.hidden.join(', ')} without declaring it (${p.uses.find((u) => p.hidden.includes(u.need))?.file ?? 'see `kerf plugins audit`'}).`,
        `Have it declared, or review it and run \`kerf plugins approve ${p.name}\`.`,
      )
    if (p.integrityChanged)
      report(
        'P110',
        p.name,
        `\`${p.name}\`${p.lockedVersion && p.lockedVersion !== p.version ? ` went from ${p.lockedVersion} to ${p.version} and its` : `'s installed`} code isn't what the lock recorded.`,
        `Reinstall the locked version, or review the update and run \`kerf plugins approve ${p.name}\`.`,
      )
  }
  return out
}

/** Stops `kerf dev` and `kerf build` before a blocked plugin's build hooks run. */
export function requireTrust(root, loaded) {
  if (loaded.diagnostics.some((d) => d.code === 'P007')) return
  const blocked = trustDiagnostics(root, loaded).filter((d) => d.severity === 'error')
  if (blocked.length)
    throw refused(blocked.map((d) => `${d.code} ${d.why} ${d.fix.text}`).join('\n'))
}

/** `kerf plugins audit --json`. */
export function auditCommand(root, loaded) {
  const status = trustStatus(root, loaded, { full: true })
  const diagnostics = trustDiagnostics(root, loaded, status)
  return {
    ok: !diagnostics.some((d) => d.severity === 'error'),
    ...status,
    diagnostics: [...loaded.diagnostics, ...diagnostics],
  }
}

/** `.kerf/` in a .gitignore hides the lock, and a lock nobody commits protects nobody. */
function unignoreLock(root) {
  const file = join(root, '.gitignore')
  if (!existsSync(file)) return false
  const text = readFileSync(file, 'utf8')
  const next = text.replace(/^\/?\.kerf\/?$/m, `.kerf/*\n!${lockFile}`)
  if (next === text) return false
  writeFileSync(file, next)
  return true
}

/**
 * `kerf plugins approve`: names, or `all`. With neither it only shows what's waiting, so approving is always something
 * said out loud, one plugin at a time or all at once.
 */
export function approveCommand(root, loaded, { names = [], all = false } = {}) {
  const failed = loaded.diagnostics.find((d) => d.code === 'P007')
  if (failed) throw refused(`The config doesn't load, so nothing can be approved: ${failed.why}`)
  const status = trustStatus(root, loaded, { full: true })
  if (status.broken)
    throw refused(
      `${lockFile} can't be read: ${status.broken}. Fix it, or delete it and approve each plugin again.`,
    )
  const pending = status.plugins.filter((p) => p.blocked)
  const unknown = names.filter((n) => !status.plugins.some((p) => p.name === n))
  if (unknown.length)
    throw Object.assign(new Error(`not in \`plugins\`: ${unknown.join(', ')}`), { code: 'E_USAGE' })
  if (!all && !names.length)
    return {
      ok: !pending.length,
      written: false,
      lock: lockFile,
      approved: [],
      pending,
      stale: status.stale,
    }

  const chosen = status.plugins.filter((p) => all || names.includes(p.name))
  const entries = { ...readLock(root).plugins }
  if (all) for (const name of status.stale) delete entries[name]
  for (const p of chosen)
    entries[p.name] = {
      version: p.version,
      integrity: p.integrity,
      permissions: p.permissions,
      provides: p.provides,
      undeclared: p.undeclared,
    }
  const ordered = Object.fromEntries(
    Object.keys(entries)
      .sort()
      .map((name) => [name, entries[name]]),
  )
  mkdirSync(join(root, '.kerf'), { recursive: true })
  writeFileSync(
    join(root, lockFile),
    `${JSON.stringify({ version: 1, plugins: ordered }, null, 2)}\n`,
  )
  return {
    ok: true,
    written: true,
    lock: lockFile,
    approved: chosen,
    pending: pending.filter((p) => !chosen.includes(p)),
    stale: all ? [] : status.stale,
    gitignore: unignoreLock(root),
  }
}

/** One line per plugin for the terminal. */
export function formatTrust(p) {
  const parts = [
    ...p.added.map((g) => `+${g}`),
    ...p.removed.map((g) => `-${g}`),
    ...p.hidden.map((n) => `undeclared ${n}`),
    ...(p.integrityChanged
      ? [
          `code changed${p.lockedVersion && p.lockedVersion !== p.version ? ` (${p.lockedVersion} → ${p.version})` : ''}`,
        ]
      : []),
  ]
  return `${p.blocked ? '!' : ' '} ${p.name}@${p.version ?? '?'}  ${parts.join('  ') || (p.locked ? 'approved' : 'not locked, asks for nothing')}`
}
