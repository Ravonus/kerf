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
  const parsed = ts.parseJsonConfigFileContent({ compilerOptions: { jsx: 'preserve', target: 'esnext', module: 'esnext', moduleResolution: 'bundler', skipLibCheck: true, noEmit: true, strict: true, types: [], allowImportingTsExtensions: true, paths: { weft: ['../weft/src/index.ts'], 'weft/*': ['../weft/src/*'], '@weft-js/warp-core': ['../warp-core/src/index.ts'], '@weft-js/warp-icons': ['../icons/src/gen/index.tsx'] } }, files: ['src/index.ts'] }, ts.sys, warp)
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
    // Components that keep `props` whole say their defaults where they read them: `props.size ?? 'md'`. Only a plain
    // literal counts, and only when every read agrees.
    const fallbacks = new Map()
    for (const [, prop, value] of decl.getText().matchAll(/\bprops\.(\w+)\s*\?\?\s*('[^'\n]*'|"[^"\n]*"|-?\d[\d_.]*|true|false)(?=\s*[,;)}\]:])/g)) fallbacks.set(prop, fallbacks.has(prop) && fallbacks.get(prop) !== value ? null : value)
    for (const [prop, value] of fallbacks) if (value !== null && !defaults.has(prop)) defaults.set(prop, value)
    // A prop the file falls back from with something worked out (`props.searchable ?? items.length > LONG`) has no one
    // default, and mustn't be shown one.
    const fileText = decl.getSourceFile().text
    const worked = new Set([...fileText.matchAll(/\.(\w+)\s*\?\?\s*(?!('[^'\n]*'|"[^"\n]*"|-?\d[\d_.]*|true|false)\s*[,;)}\]:])/g)].map(m => m[1]))
    // A switch read as `props.wrap !== false` is on unless it's turned off.
    for (const [, prop] of fileText.matchAll(/\.(\w+)\s*!==\s*false\b/g)) if (!defaults.has(prop)) defaults.set(prop, 'true')
    for (const [, prop] of fileText.matchAll(/\b(\w+)\s*===\s*false\b/g)) worked.add(prop)
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
          default: defaults.get(p.name) ?? p.getJsDocTags(checker).find(t => t.name === 'default')?.text?.map(x => x.text).join('').trim(),
          worked: worked.has(p.name) && !defaults.has(p.name) ? true : undefined,
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

const names = binding => (ts.isIdentifier(binding) ? [binding.text] : binding.elements.flatMap(e => (ts.isOmittedExpression(e) ? [] : names(e.name))))

/** The shared world's declarations, so an example that uses them can be pasted without this site's files. */
function readWorld(path) {
  const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const decls = new Map(), imports = []
  sf.forEachChild(n => {
    if (ts.isImportDeclaration(n)) { for (const e of n.importClause?.namedBindings?.elements ?? []) imports.push({ name: e.name.text, from: n.moduleSpecifier.text }); return }
    const text = n.getText().replace(/^export /, '')
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) for (const name of names(d.name)) decls.set(name, text)
    else if (n.name && ts.isIdentifier(n.name)) decls.set(n.name.text, text)
  })
  return { decls, imports }
}

/**
 * Each named export of an examples file, with what a reader needs to paste it: the component under a short name, the
 * imports it uses, and every helper and piece of the shared world it reaches, so the code runs on its own.
 */
export function readExamples(path) {
  const text = readFileSync(path, 'utf8')
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const imports = []
  const helpers = new Map()
  const exported = new Map()
  let world
  sf.forEachChild(n => {
    if (ts.isImportDeclaration(n)) {
      if (n.moduleSpecifier.text.endsWith('/world')) { world = readWorld(join(dirname(path), `${n.moduleSpecifier.text}.ts`)); return }
      imports.push({ from: n.moduleSpecifier.text, names: n.importClause?.namedBindings?.elements?.map(e => e.name.text) ?? [], type: n.importClause?.isTypeOnly })
      return
    }
    const isExported = ts.canHaveModifiers(n) && ts.getModifiers(n)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    if (ts.isFunctionDeclaration(n) && n.name) (isExported ? exported : helpers).set(n.name.text, n)
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) for (const name of names(d.name)) (isExported ? exported : helpers).set(name, n)
    if (ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) helpers.set(n.name.text, n)
  })
  const uses = (source, name) => new RegExp(`(?<![\\w'"-]|(?<!\\.\\.)\\.)${name.replace(/\$/g, '\\$')}\\b`).test(source)
  const out = new Map()
  for (const [name, node] of exported) {
    const fn = ts.isFunctionDeclaration(node) ? node : node.declarationList.declarations[0].initializer
    const stateless = fn && ts.isArrowFunction(fn) && !ts.isBlock(fn.body) && !fn.parameters.length
    const body = stateless ? dedent(`${' '.repeat(sf.getLineAndCharacterOfPosition(fn.body.getStart()).character)}${fn.body.getText().replace(/^\(\s*|\s*\)$/g, '')}`) : node.getText().replace(/^export /, '')
    const seen = new Set(), from = new Set()
    const pull = source => {
      for (const [h, n] of helpers) if (!seen.has(h) && uses(source, h)) { seen.add(h); pull(n.getText()) }
      for (const [h, d] of world?.decls ?? []) if (!from.has(h) && !helpers.has(h) && uses(source, h)) { from.add(h); pull(d) }
    }
    pull(body)
    const local = [...new Set([...[...world?.decls ?? []].filter(([h]) => from.has(h)).map(([, d]) => d), ...[...helpers].filter(([h]) => seen.has(h)).map(([, n]) => n.getText())])]
    const all = [body, ...local].join('\n')
    const direct = new Set(imports.flatMap(i => i.names))
    const typed = (world?.imports ?? []).filter(i => !direct.has(i.name) && uses(all, i.name))
    const head = [...imports.flatMap(({ from, names, type }) => {
      const used = names.filter(n => uses(all, n))
      return used.length ? [`import ${type ? 'type ' : ''}{ ${used.join(', ')} } from '${from}'`] : []
    }), ...[...new Set(typed.map(i => i.from))].map(f => `import type { ${typed.filter(i => i.from === f).map(i => i.name).join(', ')} } from '${f}'`)]
    out.set(name, { name, stateless, body, head, local })
  }
  return out
}

/** The code a reader sees and copies for one example: a whole file that runs once pasted. */
export function showExample(found, component) {
  const short = found.name.startsWith(component) && found.name !== component ? found.name.slice(component.length) : found.name
  const taken = found.head.some(l => new RegExp(`\\b${short}\\b`).test(l)) || found.local.some(l => new RegExp(`(function|const|type) ${short}\\b`).test(l))
  const name = taken || !/^[A-Z]/.test(short) ? found.name : short
  const shown = found.stateless
    ? `export function ${name}() {\n  return (\n${found.body.split('\n').map(l => (l ? `    ${l}` : l)).join('\n')}\n  )\n}`
    : `export ${found.body.replaceAll(found.name, name)}`
  return [found.head.join('\n'), shown, found.local.join('\n\n')].filter(Boolean).join('\n\n')
}
