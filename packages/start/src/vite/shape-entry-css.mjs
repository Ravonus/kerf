import { existsSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { shapeBody, shapeCssSource, shapeStyleSpecifier } from './route-modules.mjs'

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
            candidates.add(key(candidate))
            missing.add(key(candidate))
          }
        })
        if (css) {
          styles.add(css)
          candidates.add(key(css))
        }
        continue
      }
      if (!/^\.{1,2}\//.test(spec) || /[?#]/.test(spec)) continue
      const found = await ctx.resolve(spec, file, { skipSelf: true })
      const target = found?.id ?? (!found ? resolve(dirname(file), spec) : undefined)
      if (found?.external || !target || !isAbsolute(target)) continue
      const rel = relative(root, target).replace(/\\/g, '/')
      if (rel === '..' || rel.startsWith('../') || isAbsolute(rel) ||
          /(^|\/)node_modules\//.test(rel) || /(^|\/)server\//.test(rel) ||
          /\.server(?:\.[cm]?[jt]sx?)?$/.test(rel)) continue
      if (!found) {
        candidates.add(key(target))
        missing.add(key(target))
        continue
      }
      if (!/\.[cm]?[jt]sx?$/.test(target)) continue
      candidates.add(key(target))
      await visit(target)
    }
  }
  await visit(entry)
  return { styles: [...styles], signatures, candidates, missing }
}

/** Watch a missing candidate's nearest existing parent for later creation. */
export function watchEntryCandidates(server, candidates) {
  if (!server) return
  const dirs = new Set()
  for (const file of candidates) {
    if (existsSync(file)) continue
    let dir = dirname(file)
    while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir)
    dirs.add(dir)
  }
  for (const dir of dirs) server.watcher.add(dir)
}

/** Match a Vite file event against exact or extensionless local candidates. */
export function entryCandidate(candidates, file) {
  const path = file.replace(/\\/g, '/')
  const stem = path.replace(/\.[cm]?[jt]sx?$/, '')
  return candidates?.has(path) || candidates?.has(stem) ||
    (stem.endsWith('/index') && candidates?.has(stem.slice(0, -'/index'.length))) || false
}
