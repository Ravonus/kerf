import { isAbsolute, relative } from 'node:path'
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
        const css = await shapeCssSource(ctx, file, spec)
        if (css) styles.add(css)
        continue
      }
      if (!/^\.{1,2}\//.test(spec) || /[?#]/.test(spec)) continue
      const found = await ctx.resolve(spec, file, { skipSelf: true })
      const target = found?.id
      if (found?.external || !target || !isAbsolute(target) || !/\.[cm]?[jt]sx?$/.test(target))
        continue
      const rel = relative(root, target).replace(/\\/g, '/')
      if (rel === '..' || rel.startsWith('../') || isAbsolute(rel) ||
          /(^|\/)node_modules\//.test(rel) || /(^|\/)server\//.test(rel) ||
          /\.server\.[cm]?[jt]sx?$/.test(rel)) continue
      await visit(target)
    }
  }
  await visit(entry)
  return { styles: [...styles], signatures }
}
