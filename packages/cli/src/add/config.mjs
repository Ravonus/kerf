import { createRequire } from 'node:module'
import { join } from 'node:path'
import ts from 'typescript'
import { pluginFactory, pluginName } from '../load-config.mjs'
import { refused } from './errors.mjs'

/** The import to write: `<pkg>/plugin` when the package has one, and however it exports its factory. */
function pluginImport(root, pkg) {
  const require = createRequire(join(root, 'package.json'))
  const name = pluginName(pkg)
  for (const spec of [`${pkg}/plugin`, pkg]) {
    let path
    try {
      path = require.resolve(spec)
    } catch {
      continue
    }
    const factory = pluginFactory(createRequire(import.meta.url)(path), pkg)
    if (!factory)
      throw refused(`${spec} exports no plugin factory to call, so nothing was changed.`)
    return {
      name: factory.name,
      line: `import ${factory.named ? `{ ${factory.name} }` : factory.name} from '${spec}'`,
    }
  }
  return { name, line: `import ${name} from '${pkg}'` } // not installed yet: only a dry run gets this far
}

/** The object literal `export default` gives, directly or through `defineConfig(…)`. */
function configObject(sf) {
  for (const st of sf.statements) {
    if (!ts.isExportAssignment(st)) continue
    const value = ts.isCallExpression(st.expression) ? st.expression.arguments[0] : st.expression
    if (value && ts.isObjectLiteralExpression(value)) return value
  }
  return null
}

export function addToTs(root, file, text, pkg) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const object = configObject(sf)
  if (!object)
    throw refused(
      `${file} doesn't export a plain object, so \`weft add\` can't edit it. Add \`${pkg}\` to \`plugins\` by hand.`,
    )
  const { name, line } = pluginImport(root, pkg)
  const prop = object.properties.find((p) => p.name?.getText(sf) === 'plugins')
  if (prop && !(ts.isPropertyAssignment(prop) && ts.isArrayLiteralExpression(prop.initializer)))
    throw refused(
      `\`plugins\` in ${file} isn't a plain array, so \`weft add\` can't edit it. Add \`${pkg}\` by hand.`,
    )
  const edits = []
  const imports = sf.statements.filter(ts.isImportDeclaration)
  const after = imports.at(-1)?.end ?? 0
  edits.push([after, `${imports.length ? '\n' : ''}${line}${imports.length ? '' : '\n'}`])
  if (prop) {
    const list = prop.initializer
    const last = list.elements.at(-1)
    edits.push(last ? [last.end, `, ${name}()`] : [list.getStart(sf) + 1, `${name}()`])
  } else {
    const last = object.properties.at(-1)
    edits.push(
      last
        ? [
            object.properties.end,
            `${object.properties.hasTrailingComma ? '' : ','}\n  plugins: [${name}()],`,
          ]
        : [object.getStart(sf) + 1, `\n  plugins: [${name}()],\n`],
    )
  }
  return edits
    .toSorted((a, b) => b[0] - a[0])
    .reduce((t, [at, insert]) => t.slice(0, at) + insert + t.slice(at), text)
}

export function addToData(file, text, pkg) {
  if (file.endsWith('.json')) {
    const data = JSON.parse(text)
    data.plugins = [...(data.plugins ?? []), pkg]
    return `${JSON.stringify(data, null, 2)}\n`
  }
  const { parseDocument } = createRequire(import.meta.url)('yaml')
  const doc = parseDocument(text)
  if (doc.has('plugins')) doc.addIn(['plugins'], pkg)
  else doc.set('plugins', [pkg])
  return doc.toString()
}

export const listed = (config, pkg) => (config.plugins ?? []).some((p) => p.name === pkg)

/** The config names the package already (imported or listed), which a read can tell without loading it. */
export const names = (text, pkg) =>
  new RegExp(`['"]${pkg.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(/[\\w-]+)?['"]`).test(text)
