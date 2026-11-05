// Server entry reachability follows local runtime ESM edges, including reexports.
// Type-only edges do not evaluate modules. Package/dynamic imports stay outside this graph.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { discover } from '../files.mjs'
import { isServerModule, moduleFile } from './modules.mjs'

const source = /\.[cm]?[jt]sx?$/
const ignored = /(?:\.d\.[cm]?ts$|\.(?:test|spec)\.[cm]?[jt]sx?$|\/(?:__tests__|test)\/)/
const entry = (file) => isServerModule(file)
  || /^src\/(?:entry-server|server)\.[cm]?[jt]sx?$/.test(file)
  || /^src\/routes\/.*\.[jt]sx$/.test(file)

function runtime(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause
    if (!clause) return true
    if (clause.isTypeOnly) return false
    const named = clause.namedBindings
    return !!clause.name || !named || !ts.isNamedImports(named)
      || !named.elements.length || named.elements.some((element) => !element.isTypeOnly)
  }
  if (!ts.isExportDeclaration(node) || node.isTypeOnly) return false
  const named = node.exportClause
  return !named || !ts.isNamedExports(named) || !named.elements.length
    || named.elements.some((element) => !element.isTypeOnly)
}

/** Source snapshots reachable from conventional server modules, entries and SSR route pages. */
export function serverGraph(root, { files, exclude = [] }) {
  const texts = new Map(discover(root, {
    include: ['src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}', '*.server.{ts,js,mts,mjs,cts,cjs}'],
    exclude,
  }).map((file) => [file, readFileSync(join(root, file), 'utf8')]))
  for (const file of files) texts.set(file.rel, file.text)
  for (const file of texts.keys()) if (!source.test(file) || ignored.test(file)) texts.delete(file)
  const graph = new Map()
  const visit = (file, from) => {
    if (graph.has(file) || !texts.has(file)) return
    const text = texts.get(file)
    const sf = ts.createSourceFile(join(root, file), text, ts.ScriptTarget.Latest, true)
    graph.set(file, { sf, entry: from })
    for (const node of sf.statements) {
      if (!runtime(node) || !node.moduleSpecifier || !ts.isStringLiteralLike(node.moduleSpecifier))
        continue
      const target = moduleFile(root, file, node.moduleSpecifier.text)
      if (target) visit(target, from)
    }
  }
  for (const file of [...texts.keys()].filter(entry).sort()) visit(file, file)
  return graph
}
