import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { formatImport } from './imports.mjs'

function source(path, ts) {
  const sf = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  if (sf.parseDiagnostics.length)
    throw new Error(
      `Invalid ${path}: ${ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText, ' ')}`,
    )
  return sf
}

function declarations(node, ts) {
  if (ts.isVariableStatement(node))
    return node.declarationList.declarations.flatMap((d) =>
      ts.isIdentifier(d.name) ? [d.name.text] : [],
    )
  return node.name && ts.isIdentifier(node.name) ? [node.name.text] : []
}

function localFile(from, specifier) {
  const base = resolve(dirname(from), specifier)
  for (const suffix of ['.tsx', '.ts']) if (existsSync(base + suffix)) return base + suffix
  throw new Error(`Cannot resolve ${specifier} from ${from}`)
}

function namespaceImports(sf, path, ts) {
  const namespaces = new Map()
  for (const n of sf.statements) {
    if (!ts.isImportDeclaration(n)) continue
    const binding = n.importClause?.namedBindings
    if (binding && ts.isNamespaceImport(binding)) {
      if (
        n.importClause.name ||
        n.importClause.isTypeOnly ||
        !n.moduleSpecifier.text.startsWith('.')
      )
        throw new Error(`Unsupported forwarding import in ${path}`)
      if (namespaces.has(binding.name.text))
        throw new Error(`Duplicate ${binding.name.text} in ${path}`)
      namespaces.set(binding.name.text, localFile(path, n.moduleSpecifier.text))
    }
  }
  return namespaces
}

// A forwarding barrel contains only named reexports or namespace property aliases.
function forwarding(sf, path, ts, root = false) {
  const forwards = new Map()
  const barrel = sf.statements.some(
    (n) =>
      (ts.isExportDeclaration(n) && n.moduleSpecifier) ||
      (ts.isImportDeclaration(n) &&
        n.importClause?.namedBindings &&
        ts.isNamespaceImport(n.importClause.namedBindings)),
  )
  if (!barrel) return null
  const namespaces = namespaceImports(sf, path, ts)
  const put = (name, target) => {
    if (forwards.has(name)) throw new Error(`Duplicate ${name} in ${path}`)
    forwards.set(name, target)
  }
  for (const n of sf.statements) {
    if (ts.isImportDeclaration(n)) {
      if (root && !n.importClause && n.moduleSpecifier.text.startsWith('.')) {
        localFile(path, n.moduleSpecifier.text)
        continue
      }
      const binding = n.importClause?.namedBindings
      if (
        !binding ||
        !ts.isNamespaceImport(binding) ||
        n.importClause.name ||
        n.importClause.isTypeOnly ||
        !n.moduleSpecifier.text.startsWith('.')
      )
        throw new Error(`Unsupported forwarding import in ${path}`)
    } else if (ts.isExportDeclaration(n)) {
      if (
        n.isTypeOnly ||
        !n.moduleSpecifier?.text.startsWith('.') ||
        !n.exportClause ||
        !ts.isNamedExports(n.exportClause)
      )
        throw new Error(`Unsupported forwarding export in ${path}`)
      for (const e of n.exportClause.elements) {
        if (e.isTypeOnly || (e.propertyName && e.propertyName.text !== e.name.text))
          throw new Error(`Unsupported renamed example ${e.name.text} in ${path}`)
        put(e.name.text, localFile(path, n.moduleSpecifier.text))
      }
    } else if (
      ts.isVariableStatement(n) &&
      n.declarationList.flags & ts.NodeFlags.Const &&
      ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const d of n.declarationList.declarations) {
        const value = d.initializer
        if (
          !ts.isIdentifier(d.name) ||
          !value ||
          !ts.isPropertyAccessExpression(value) ||
          !ts.isIdentifier(value.expression) ||
          !namespaces.has(value.expression.text)
        )
          throw new Error(`Unsupported forwarding declaration in ${path}`)
        if (d.name.text !== value.name.text)
          throw new Error(`Unsupported renamed example ${d.name.text} in ${path}`)
        put(d.name.text, namespaces.get(value.expression.text))
      }
    } else {
      throw new Error(`Unsupported forwarding statement in ${path}`)
    }
  }
  return forwards
}

function resolveLeaf(path, name, ts) {
  const seen = new Set()
  for (;;) {
    if (seen.has(path)) throw new Error(`Forwarding cycle for ${name} at ${path}`)
    seen.add(path)
    const sf = source(path, ts)
    const forwards = forwarding(sf, path, ts)
    if (!forwards) {
      const found = sf.statements.some(
        (n) =>
          ts.canHaveModifiers(n) &&
          ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
          declarations(n, ts).includes(name),
      )
      if (!found) throw new Error(`Missing ${name} from ${path}`)
      return path
    }
    const next = forwards.get(name)
    if (!next) throw new Error(`Missing ${name} from ${path}`)
    path = next
  }
}

// Unused aliases in a leaf do not contribute to any copied declaration.
function referenced(sf, name, ts) {
  const has = (node) =>
    (ts.isIdentifier(node) && node.text === name) || ts.forEachChild(node, has) || false
  return sf.statements.some((node) => !ts.isImportDeclaration(node) && has(node))
}

function visit(path, selected, ts, collected) {
  if (collected.active.has(path)) throw new Error(`Import cycle at ${path}`)
  if (collected.visited.has(path)) return
  collected.visited.add(path)
  collected.active.add(path)
  const sf = source(path, ts)
  const local = []
  for (const n of sf.statements) {
    if (!ts.isImportDeclaration(n)) continue
    const from = n.moduleSpecifier.text
    const named = n.importClause?.namedBindings
    if (!named || !ts.isNamedImports(named)) throw new Error(`Unsupported import in ${path}`)
    for (const e of named.elements)
      if (e.propertyName && e.propertyName.text !== e.name.text && referenced(sf, e.name.text, ts))
        throw new Error(`Unsupported renamed example ${e.name.text} in ${path}`)
    if (from.startsWith('.') && !from.endsWith('/world')) {
      const child = localFile(path, from)
      for (const e of named.elements) {
        local.push(resolveLeaf(child, (e.propertyName ?? e.name).text, ts))
      }
    } else if (from.endsWith('/world')) {
      collected.world = localFile(path, from).replace(/\.tsx?$/, '')
    } else {
      const type = !!n.importClause?.isTypeOnly
      const key = `${from}\0${type}`
      if (!collected.imports.has(key)) collected.imports.set(key, new Set())
      for (const e of named.elements) collected.imports.get(key).add(e.name.text)
    }
  }
  for (const child of local) visit(child, '', ts, collected)
  for (const n of sf.statements) {
    if (ts.isImportDeclaration(n)) continue
    const names = declarations(n, ts)
    if (!names.length) continue
    let text = n.getText(sf).replace(/^export\s+/, '')
    if (names.includes(selected)) text = `export ${text}`
    collected.decls.push(text)
  }
  collected.active.delete(path)
}

/** Read named example reexports and inline their local declarations. */
export function expandExamples(path, ts) {
  const sf = source(path, ts)
  const forwards = forwarding(sf, path, ts, true)
  if (!forwards) return null
  return [...forwards].map(([name, child]) => {
    const found = {
      visited: new Set(),
      active: new Set(),
      imports: new Map(),
      decls: [],
      world: false,
    }
    visit(resolveLeaf(child, name, ts), name, ts, found)
    if (!found.decls.some((d) => new RegExp(`^export (?:const|function) ${name}\\b`).test(d)))
      throw new Error(`Missing ${name} from ${child}`)
    const imports = [...found.imports]
      .sort(([a], [b]) => {
        const [am, at] = a.split('\0'),
          [bm, bt] = b.split('\0')
        return at.localeCompare(bt) || am.localeCompare(bm)
      })
      .map(([key, names]) => {
        const [from, type] = key.split('\0')
        return formatImport(
          [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
          from,
          type === 'true',
        )
      })
    if (found.world) {
      let world = relative(dirname(resolve(path)), found.world)
      if (!world.startsWith('.')) world = `./${world}`
      imports.push(`import {} from '${world}'`)
    }
    return [...imports, ...found.decls].join('\n\n')
  })
}
