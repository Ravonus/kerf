// The toolkit's facts, read from warp's source so they can't drift: its exports, each one's props from the type checker,
// and the parts it draws. The words and examples are written by hand in src/toolkit; `readExamples` reads those examples'
// own source, so the code on a page is the code running on it.
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { readdirSync, readFileSync } from 'node:fs'

const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url))
const ts = require('typescript')

const slugOf = name => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
const oneLine = text => text.replace(/\s+/g, ' ').trim()

export function readToolkit(repo) {
  const warp = join(repo, 'packages/warp')
  const parsed = ts.parseJsonConfigFileContent({ compilerOptions: { jsx: 'preserve', target: 'esnext', module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true, noEmit: true, strict: true, types: [], allowImportingTsExtensions: true, paths: { weft: ['../weft/src/index.ts'], 'weft/*': ['../weft/src/*'], '@weft/warp-core': ['../warp-core/src/index.ts'], '@weft/icons': ['../icons/src/gen/index.tsx'] } }, files: ['src/index.ts'] }, ts.sys, warp)
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const checker = program.getTypeChecker()
  const entry = program.getSourceFile(join(warp, 'src/index.ts'))
  const out = []
  for (let sym of checker.getExportsOfModule(checker.getSymbolAtLocation(entry))) {
    const name = sym.name
    if (!/^[A-Z]/.test(name)) continue
    if (sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym)
    const decl = sym.valueDeclaration
    if (!decl) continue
    const file = decl.getSourceFile().fileName
    if (file.includes('/node_modules/')) continue
    const sig = checker.getTypeOfSymbolAtLocation(sym, decl).getCallSignatures()[0]
    if (!sig) continue
    const param = sig.parameters[0]
    const props = []
    const defaults = new Map()
    const first = decl.parameters?.[0] ?? decl.initializer?.parameters?.[0]
    if (first && ts.isObjectBindingPattern(first.name)) for (const el of first.name.elements) if (el.initializer) defaults.set((el.propertyName ?? el.name).getText(), el.initializer.getText())
    if (param) {
      const type = checker.getTypeOfSymbolAtLocation(param, decl)
      for (const p of type.getProperties?.() ?? []) {
        if (/^(on[A-Z]\w+Capture|__)/.test(p.name)) continue
        const d = p.valueDeclaration ?? p.declarations?.[0]
        if (d?.getSourceFile().fileName.includes('/node_modules/')) continue
        const t = checker.getTypeOfSymbolAtLocation(p, d ?? decl)
        const members = (t.isUnion() ? t.types : [t]).filter(m => !(m.flags & ts.TypeFlags.Undefined))
        const literal = members.length > 1 && members.every(m => m.isStringLiteral() || m.isNumberLiteral())
        props.push({
          values: literal ? members.map(m => m.value) : undefined,
          name: p.name,
          type: oneLine(checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope)).replace(/ \| undefined$/, ''),
          required: !(p.flags & ts.SymbolFlags.Optional),
          default: defaults.get(p.name),
          doc: oneLine(ts.displayPartsToString(p.getDocumentationComment(checker))),
        })
      }
    }
    const doc = oneLine(ts.displayPartsToString(sym.getDocumentationComment(checker)))
    const rel = relative(warp, file)
    const body = decl.getText()
    const parts = [...new Set([...body.matchAll(/data-part="([a-z-]+)"/g)].map(m => m[1]))]
    const scope = /data-scope="([a-z-]+)"/.exec(body)?.[1]
    const states = [...new Set([...body.matchAll(/\b(data-(?!part|scope|act|close|site)[a-z-]+)=/g)].map(m => m[1]))]
    out.push({ name, slug: slugOf(name), file: `packages/warp/${rel}`, doc, props, parts, scope, states })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

const dedent = text => {
  const lines = text.split('\n')
  const margin = Math.min(...lines.filter(l => l.trim()).map(l => /^ */.exec(l)[0].length))
  return lines.map(l => l.slice(margin)).join('\n').trim()
}

/** A fragment's children, for a page: the wrapper is there to satisfy the file, and a reader doesn't paste it. */
function unwrap(text) {
  const inner = /^<>\s*([\s\S]*?)\s*<\/>$/.exec(text.trim())
  return inner ? dedent(`\n${' '.repeat(/\n( *)\S/.exec(text)?.[1]?.length ?? 0)}${inner[1]}`) : text.trim()
}

/**
 * Each named export of an examples file, with what a reader needs to paste it: a stateless example is its JSX, a stateful
 * one its whole function under a name without the component's prefix. Either way the import lines and any helper it uses
 * come first. Imports from the shared world read `./data`, since that is what they are to a reader.
 */
export function readExamples(path) {
  const text = readFileSync(path, 'utf8')
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const imports = []
  const helpers = new Map()
  const exported = new Map()
  sf.forEachChild(n => {
    if (ts.isImportDeclaration(n)) {
      if (n.importClause?.isTypeOnly) return
      const names = n.importClause?.namedBindings?.elements?.map(e => e.name.text) ?? []
      imports.push({ from: n.moduleSpecifier.text, names })
      return
    }
    const isExported = ts.canHaveModifiers(n) && ts.getModifiers(n)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    if (ts.isFunctionDeclaration(n) && n.name) (isExported ? exported : helpers).set(n.name.text, n)
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name)) (isExported ? exported : helpers).set(d.name.text, n)
  })
  const uses = (source, name) => new RegExp(`(?<![\\w.])${name.replace(/\$/g, '\\$')}\\b`).test(source)
  const out = new Map()
  for (const [name, node] of exported) {
    const fn = ts.isFunctionDeclaration(node) ? node : node.declarationList.declarations[0].initializer
    const stateless = fn && ts.isArrowFunction(fn) && !ts.isBlock(fn.body) && !fn.parameters.length
    let body = stateless ? unwrap(dedent(`${' '.repeat(sf.getLineAndCharacterOfPosition(fn.body.getStart()).character)}${fn.body.getText().replace(/^\(\s*|\s*\)$/g, '')}`)) : node.getText().replace(/^export /, '')
    const seen = new Set()
    const pull = source => {
      for (const [h, n] of helpers) if (!seen.has(h) && uses(source, h)) { seen.add(h); pull(n.getText()) }
    }
    pull(body)
    const local = [...new Set([...helpers].filter(([h]) => seen.has(h)).map(([, n]) => n))].map(n => n.getText())
    const all = [body, ...local].join('\n')
    const head = imports.flatMap(({ from, names }) => {
      const used = names.filter(n => uses(all, n))
      return used.length ? [`import { ${used.join(', ')} } from '${from.startsWith('.') ? './data' : from}'`] : []
    })
    out.set(name, { name, stateless, body, head, local })
  }
  return out
}

/** The code a reader sees for one example. */
export function showExample(found, component) {
  const shown = found.stateless ? found.body : found.body.replaceAll(found.name, found.name.startsWith(component) && found.name !== component ? found.name.slice(component.length) : found.name)
  return [found.head.join('\n'), found.local.join('\n\n'), shown].filter(Boolean).join('\n\n')
}
