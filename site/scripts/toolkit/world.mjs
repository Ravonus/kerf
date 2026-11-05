// Read the world's local modules so copied examples include their data and helpers.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

function localFile(path, from) {
  const base = resolve(dirname(path), from)
  for (const suffix of ['.ts', '.tsx']) if (existsSync(base + suffix)) return base + suffix
  throw new Error(`Cannot resolve ${from} from ${path}`)
}

function names(binding, ts) {
  return ts.isIdentifier(binding)
    ? [binding.text]
    : binding.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : names(e.name, ts)))
}

function declarations(node, ts) {
  if (ts.isVariableStatement(node))
    return node.declarationList.declarations.flatMap((d) => names(d.name, ts))
  return node.name && ts.isIdentifier(node.name) ? [node.name.text] : []
}

function source(path, ts) {
  const sf = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  if (sf.parseDiagnostics.length)
    throw new Error(
      `Invalid ${path}: ${ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText, ' ')}`,
    )
  return sf
}

function visit(path, ts, found) {
  if (found.visited.has(path)) return found.visited.get(path)
  const sf = source(path, ts)
  const exports = new Set()
  found.visited.set(path, exports)
  for (const n of sf.statements) {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
      if (!n.moduleSpecifier) continue
      const from = n.moduleSpecifier.text
      const clause = ts.isImportDeclaration(n) ? n.importClause?.namedBindings : n.exportClause
      if (!clause || !(ts.isNamedImports(clause) || ts.isNamedExports(clause)))
        throw new Error(`Unsupported named import or export in ${path}`)
      if (from.startsWith('.')) {
        const child = localFile(path, from)
        const available = visit(child, ts, found)
        for (const e of clause.elements) {
          const name = (e.propertyName ?? e.name).text
          if (name !== e.name.text) throw new Error(`Unsupported renamed world name ${name}`)
          if (!available.has(name)) throw new Error(`Missing ${name} from ${child}`)
          if (ts.isExportDeclaration(n)) exports.add(name)
        }
      } else if (ts.isImportDeclaration(n)) {
        for (const e of clause.elements)
          if (
            !found.imports.some(
              (i) =>
                i.name === e.name.text && i.from === from && i.type === !!n.importClause.isTypeOnly,
            )
          )
            found.imports.push({ name: e.name.text, from, type: !!n.importClause.isTypeOnly })
      }
      continue
    }
    const declared = declarations(n, ts)
    const text = n.getText(sf).replace(/^export\s+/, '')
    for (const name of declared) {
      found.decls.set(name, text)
      if (n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) exports.add(name)
    }
  }
  return exports
}

/** Collect local declarations in dependency order for pasteable examples. */
export function readWorld(path, ts) {
  const found = { decls: new Map(), imports: [], visited: new Map() }
  visit(path, ts, found)
  return found
}
