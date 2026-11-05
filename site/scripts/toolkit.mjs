// The toolkit's facts, read from warp's source so they can't drift: its exports, each one's props from the type checker,
// and the parts it draws. The words and examples are written by hand in src/toolkit; `readExamples` reads those examples'
// own source, so the code on a page is the code running on it.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { expandExamples } from './toolkit/examples.mjs'
import { readWorld } from './toolkit/world.mjs'

const require = createRequire(new URL('../../packages/cli/package.json', import.meta.url))
const ts = require('typescript')

export { readToolkit } from './toolkit/catalog.mjs'

const dedent = (text) => {
  const lines = text.split('\n')
  const margin = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length))
  return lines
    .map((l) => l.slice(margin))
    .join('\n')
    .trim()
}

const names = (binding) =>
  ts.isIdentifier(binding)
    ? [binding.text]
    : binding.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : names(e.name)))

/**
 * Each named export of an examples file, with what a reader needs to paste it: the component under a short name, the
 * imports it uses, and every helper and piece of the shared world it reaches, so the code runs on its own.
 */
export function readExamples(path) {
  const expanded = expandExamples(path, ts)
  if (expanded) return new Map(expanded.flatMap((text) => [...readExampleSource(path, text)]))
  return readExampleSource(path, readFileSync(path, 'utf8'))
}

function scanExample(sf, path) {
  const imports = []
  const helpers = new Map()
  const exported = new Map()
  let world
  sf.forEachChild((n) => {
    if (ts.isImportDeclaration(n)) {
      if (n.moduleSpecifier.text.endsWith('/world')) {
        world = readWorld(join(dirname(path), `${n.moduleSpecifier.text}.ts`), ts)
        return
      }
      imports.push({
        from: n.moduleSpecifier.text,
        names: n.importClause?.namedBindings?.elements?.map((e) => e.name.text) ?? [],
        type: n.importClause?.isTypeOnly,
      })
      return
    }
    const isExported =
      ts.canHaveModifiers(n) &&
      ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (ts.isFunctionDeclaration(n) && n.name) (isExported ? exported : helpers).set(n.name.text, n)
    if (ts.isVariableStatement(n))
      for (const d of n.declarationList.declarations)
        for (const name of names(d.name)) (isExported ? exported : helpers).set(name, n)
    if (ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) helpers.set(n.name.text, n)
  })
  return { imports, helpers, exported, world }
}

function readExampleSource(path, text) {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const { imports, helpers, exported, world } = scanExample(sf, path)
  const uses = (source, name) =>
    new RegExp(`(?<![\\w'"-]|(?<!\\.\\.)\\.)${name.replace(/\$/g, '\\$')}\\b`).test(source)
  const out = new Map()
  for (const [name, node] of exported) {
    const fn = ts.isFunctionDeclaration(node)
      ? node
      : node.declarationList.declarations[0].initializer
    const stateless = fn && ts.isArrowFunction(fn) && !ts.isBlock(fn.body) && !fn.parameters.length
    const body = stateless
      ? dedent(
          `${' '.repeat(sf.getLineAndCharacterOfPosition(fn.body.getStart()).character)}${fn.body.getText().replace(/^\(\s*|\s*\)$/g, '')}`,
        )
      : node.getText().replace(/^export /, '')
    const seen = new Set(),
      from = new Set()
    const pull = (source) => {
      for (const [h, n] of helpers)
        if (!seen.has(h) && uses(source, h)) {
          seen.add(h)
          pull(n.getText())
        }
      for (const [h, d] of world?.decls ?? [])
        if (!from.has(h) && !helpers.has(h) && uses(source, h)) {
          from.add(h)
          pull(d)
        }
    }
    pull(body)
    const local = [
      ...new Set([
        ...[...(world?.decls ?? [])].filter(([h]) => from.has(h)).map(([, d]) => d),
        ...[...helpers].filter(([h]) => seen.has(h)).map(([, n]) => n.getText()),
      ]),
    ]
    const all = [body, ...local].join('\n')
    const direct = new Set(imports.flatMap((i) => i.names))
    const typed = (world?.imports ?? []).filter((i) => !direct.has(i.name) && uses(all, i.name))
    const head = [
      ...imports.flatMap(({ from: module, names: imported, type }) => {
        const used = imported.filter((n) => uses(all, n))
        return used.length
          ? [`import ${type ? 'type ' : ''}{ ${used.join(', ')} } from '${module}'`]
          : []
      }),
      ...[...new Set(typed.map((i) => `${i.type ? 'type' : 'value'}\0${i.from}`))].map((key) => {
        const [kind, f] = key.split('\0')
        return `import ${kind === 'type' ? 'type ' : ''}{ ${typed
          .filter((i) => i.from === f && i.type === (kind === 'type'))
          .map((i) => i.name)
          .join(', ')} } from '${f}'`
      }),
    ]
    out.set(name, { name, stateless, body, head, local })
  }
  return out
}

/** The code a reader sees and copies for one example: a whole file that runs once pasted. */
export function showExample(found, component) {
  const short =
    found.name.startsWith(component) && found.name !== component
      ? found.name.slice(component.length)
      : found.name
  const taken =
    found.head.some((l) => new RegExp(`\\b${short}\\b`).test(l)) ||
    found.local.some((l) => new RegExp(`(function|const|type) ${short}\\b`).test(l))
  const name = taken || !/^[A-Z]/.test(short) ? found.name : short
  const shown = found.stateless
    ? `export function ${name}() {\n  return (\n${found.body
        .split('\n')
        .map((l) => (l ? `    ${l}` : l))
        .join('\n')}\n  )\n}`
    : `export ${found.body.replaceAll(found.name, name)}`
  return [found.head.join('\n'), shown, found.local.join('\n\n')].filter(Boolean).join('\n\n')
}
