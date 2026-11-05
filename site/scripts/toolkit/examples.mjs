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

function visit(path, selected, ts, collected) {
  if (collected.visited.has(path)) return
  collected.visited.add(path)
  const sf = source(path, ts)
  const local = []
  for (const n of sf.statements) {
    if (!ts.isImportDeclaration(n)) continue
    const from = n.moduleSpecifier.text
    const named = n.importClause?.namedBindings
    if (!named || !ts.isNamedImports(named)) throw new Error(`Unsupported import in ${path}`)
    if (from.startsWith('.') && !from.endsWith('/world')) {
      const child = localFile(path, from)
      const childSource = source(child, ts)
      const available = new Set(
        childSource.statements
          .filter(
            (node) =>
              ts.canHaveModifiers(node) &&
              ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
          )
          .flatMap((node) => declarations(node, ts)),
      )
      for (const e of named.elements)
        if (!available.has((e.propertyName ?? e.name).text))
          throw new Error(`Missing ${e.name.text} from ${child}`)
      local.push(child)
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
}

/** Read named example reexports and inline their local declarations. */
export function expandExamples(path, ts) {
  const sf = source(path, ts)
  const exports = sf.statements.filter((n) => ts.isExportDeclaration(n) && n.moduleSpecifier)
  if (!exports.length) return null
  return exports.flatMap((n) => {
    if (!n.exportClause || !ts.isNamedExports(n.exportClause))
      throw new Error(`Unsupported reexport in ${path}`)
    const child = localFile(path, n.moduleSpecifier.text)
    return n.exportClause.elements.map((e) => {
      const name = (e.propertyName ?? e.name).text
      if (name !== e.name.text) throw new Error(`Unsupported renamed example ${name}`)
      const found = { visited: new Set(), imports: new Map(), decls: [], world: false }
      visit(child, name, ts, found)
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
  })
}
