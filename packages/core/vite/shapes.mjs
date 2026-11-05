import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { transform } from './compiler.mjs'

const EXT = /\.[cm]?[jt]sx?$/
const SHAPE_IMPORTS = /import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}\s*)?from\s+['"](\.[^'"]+)['"]/g

/** Exports with a shape variant by file (`facts.shapes`, research 31 §5), read when a file imports one. */
const shapeExports = new Map()
function exportsOf(file) {
  const mtime = statSync(file, { throwIfNoEntry: false })?.mtimeMs
  if (mtime === undefined) return []
  const seen = shapeExports.get(file)
  if (seen?.mtime === mtime) return seen.exports
  const exports = transform(readFileSync(file, 'utf8'), { filename: file, checkOnly: true }).facts
    .shapes
  shapeExports.set(file, { mtime, exports })
  return exports
}

/** `options.shapes` for one file: which of the components it imports by relative path have a variant. */
export async function importedShapes(ctx, code, id) {
  const out = {}
  for (const [, def, names, spec] of code.matchAll(SHAPE_IMPORTS)) {
    const file = (await ctx.resolve(spec, id, { skipSelf: true }))?.id?.replace(/\?.*$/, '')
    if (!file || !/\.[jt]sx$/.test(file)) continue
    const found = exportsOf(file)
    const key = resolvePath(dirname(id), spec).replace(EXT, '')
    for (const n of [
      ...(def ? ['default'] : []),
      ...(names ?? '').split(',').map(
        (x) =>
          x
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0],
      ),
    ])
      if (found.includes(n)) out[`${key}#${n}`] = true
  }
  return out
}
