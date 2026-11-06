import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { shapeBody, shapeCssSource, shapeStyleSpecifier } from './route-modules.mjs'

// Follow existing ancestors so a symlink cannot turn an in-project watch into an outside watch.
function projectParent(root, file) {
  try {
    const project = realpathSync(root)
    let dir = dirname(file)
    while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir)
    const parent = realpathSync(dir)
    const rel = relative(project, parent)
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return
    return parent
  } catch {
    return undefined
  }
}

// Resolvers may preserve symlinks, so both the apparent and actual file must be app source.
function appSource(root, file) {
  const blocked = (base, path) => {
    const rel = relative(base, path).replace(/\\/g, '/')
    return rel === '..' || rel.startsWith('../') || isAbsolute(rel) ||
      /(^|\/)node_modules\//.test(rel) || /(^|\/)server\//.test(rel) ||
      /\.server\.[cm]?[jt]sx?$/.test(rel)
  }
  try {
    return !blocked(root, file) && !blocked(realpathSync(root), realpathSync(file))
  } catch {
    return false
  }
}

// Only static runtime import/export edges can lead to a stylesheet here.
function sources(file) {
  return shapeBody(file).filter((node) => {
    if (node.type === 'ImportDeclaration') {
      return node.importKind !== 'type' &&
        (!node.specifiers.length || node.specifiers.some((item) => item.importKind !== 'type'))
    }
    return (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
      node.exportKind !== 'type' && node.source
  })
}

function signature(nodes) {
  return JSON.stringify(nodes.map((node) => [
    node.type, node.source.value, node.type === 'ImportDeclaration' && !node.specifiers.length,
  ]))
}

/** Signature of the static dependency edges relevant to entry styles. */
export function entryCssSignature(file) {
  return signature(sources(file))
}

/** Collect safely resolvable local entry dependencies and their CSS in source order. */
export async function entryCss(ctx, entry, root) {
  const seen = new Set()
  const styles = new Set()
  const signatures = new Map()
  const candidates = new Set()
  const missing = new Set()
  const key = (file) => file.replace(/\\/g, '/')
  const visit = async (file) => {
    if (seen.has(file) || seen.size >= 256) return
    seen.add(file)
    const nodes = sources(file)
    signatures.set(file, signature(nodes))
    for (const node of nodes) {
      const spec = node.source.value
      if (
        node.type === 'ImportDeclaration' && !node.specifiers.length && shapeStyleSpecifier(spec)
      ) {
        const css = await shapeCssSource(ctx, file, spec, () => {
          if (/^\.{1,2}\//.test(spec)) {
            const candidate = resolve(dirname(file), spec)
            if (projectParent(root, candidate)) {
              candidates.add(key(candidate))
              missing.add(key(candidate))
            }
          }
        })
        if (css) {
          styles.add(css)
          candidates.add(key(css))
        }
        continue
      }
      if (/[?#]/.test(spec) || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(spec)) continue
      const found = await ctx.resolve(spec, file, { skipSelf: true })
      const local = /^\.{1,2}\//.test(spec)
      const target = found?.id ?? (!found && local ? resolve(dirname(file), spec) : undefined)
      if (found?.external || !target || !isAbsolute(target)) continue
      const rel = relative(root, target).replace(/\\/g, '/')
      if (rel === '..' || rel.startsWith('../') || isAbsolute(rel) ||
          /(^|\/)node_modules\//.test(rel) || /(^|\/)server\//.test(rel) ||
          /\.server(?:\.[cm]?[jt]sx?)?$/.test(rel)) continue
      if (!found) {
        if (projectParent(root, target)) {
          candidates.add(key(target))
          missing.add(key(target))
        }
        continue
      }
      if (!/\.[cm]?[jt]sx?$/.test(target) || !appSource(root, target)) continue
      candidates.add(key(target))
      await visit(target)
    }
  }
  await visit(entry)
  return { styles: [...styles], signatures, candidates, missing }
}

/** Watch a missing candidate's nearest existing parent for later creation. */
export function watchEntryCandidates(server, candidates, root) {
  if (!server || !root) return
  const dirs = new Set()
  for (const file of candidates) {
    if (existsSync(file)) continue
    const dir = projectParent(root, file)
    if (dir) dirs.add(dir)
  }
  for (const dir of dirs) server.watcher.add(dir)
}

/** Clear this server's entry metadata without changing the shared Vite watcher. */
export function entryWatchLifecycle(state, server, modes) {
  state.shapeEntryOwner = server
  const close = server.close
  server.close = async function (...args) {
    try {
      return await close.apply(this, args)
    } finally {
      if (state.shapeEntryOwner === server) {
        delete state.shapeEntryOwner
        delete state.shapeEntrySignatures
        delete state.shapeEntryCandidates
        delete state.shapeEntryMissing
        if (state.vite === server) state.vite = undefined
        modes.clear()
      }
    }
  }
}

/** Match a Vite file event against exact or extensionless local candidates. */
export function entryCandidate(candidates, file) {
  const path = file.replace(/\\/g, '/')
  const stem = path.replace(/\.[cm]?[jt]sx?$/, '')
  return candidates?.has(path) || candidates?.has(stem) ||
    (stem.endsWith('/index') && candidates?.has(stem.slice(0, -'/index'.length))) || false
}
