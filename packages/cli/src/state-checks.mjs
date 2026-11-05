// S001 and S012 in `weft check` (research 14 §3.1, §3.4, research 29 §4): server values copied into state, and
// `state.linked` over one with no `key`. X037: a resource or query made beside the `<Boundary>` meant to wait for it.
// These need to know which imports are queries, so they read the server modules; the compiler sees one file at a time. TypeScript's parser only, no type checking, and a name's taint lasts for the
// function it was declared in, so a same-named primitive elsewhere isn't flagged.

import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { local } from './alias.mjs'
import { diagnostic, positions } from './diag.mjs'
import { discover } from './files.mjs'
import { scan } from './state-checks/scan.mjs'

const isServerModule = (rel) => rel.startsWith('src/server/') || /\.server\.[cm]?[jt]sx?$/.test(rel)
/** `export const name = query(` in a module: the names of its queries. */
const queriesOf = (text) =>
  new Set(
    [...text.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*query\s*\(/g)].map((m) => m[1]),
  )

function moduleFile(root, from, spec) {
  const abs = local(join(root, from), spec)
  if (!abs) return undefined
  const base = relative(root, abs).split('\\').join('/').replace(/\.js$/, '')
  return ['', '.ts', '.tsx', '.mts', '.js', '/index.ts']
    .map((x) => base + x)
    .find((f) => /\.[cm]?[jt]sx?$/.test(f) && existsSync(join(root, f)))
}

/** Local names of the queries `sf` imports from server modules. */
function importedQueries(root, rel, sf, cache) {
  const out = new Set()
  for (const n of sf.statements) {
    if (
      !ts.isImportDeclaration(n) ||
      !n.importClause?.namedBindings ||
      !ts.isNamedImports(n.importClause.namedBindings)
    )
      continue
    const file = moduleFile(root, rel, n.moduleSpecifier.text)
    if (!file || !isServerModule(file)) continue
    if (!cache.has(file)) cache.set(file, queriesOf(readFileSync(join(root, file), 'utf8')))
    for (const s of n.importClause.namedBindings.elements)
      if (cache.get(file).has((s.propertyName ?? s.name).text)) out.add(s.name.text)
  }
  return out
}

/** The local names `resource` is imported as from @weft-js/core. */
const resourceNames = (sf) =>
  new Set(
    sf.statements.flatMap((n) =>
      ts.isImportDeclaration(n) &&
      n.moduleSpecifier.text === '@weft-js/core' &&
      n.importClause?.namedBindings &&
      ts.isNamedImports(n.importClause.namedBindings)
        ? n.importClause.namedBindings.elements
            .filter((s) => (s.propertyName ?? s.name).text === 'resource')
            .map((s) => s.name.text)
        : [],
    ),
  )

/**
 * X037: a `resource` or query made in a component's own body and read inside a `<Boundary>` that component renders. A
 * Boundary waits for what is made while its children are built, so it never sees this one: no fallback shows, and the
 * content renders with nothing in it. Only a read inside the Boundary's children counts: reading it elsewhere is fine.
 * @param {ts.SourceFile} sf @param {Set<string>} makers names whose call makes one (`resource` and the queries)
 */
function madeBesideBoundary(sf, makers, report) {
  const peel = (e) => {
    while (
      ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isSatisfiesExpression(e)
    )
      e = e.expression
    return e
  }
  const maker = (e) => {
    e = peel(e)
    if (!ts.isCallExpression(e)) return undefined
    const c = e.expression
    const name = ts.isIdentifier(c)
      ? c.text
      : ts.isPropertyAccessExpression(c) && c.name.text === 'live' && ts.isIdentifier(c.expression)
        ? c.expression.text
        : undefined
    return name !== undefined && makers.has(name) ? e : undefined
  }
  const nested = (n) =>
    ts.isFunctionDeclaration(n) ||
    (ts.isVariableDeclaration(n) &&
      !!n.initializer &&
      (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)))
  function component(fn) {
    /** @type {Map<string, ts.CallExpression>} */
    const made = new Map()
    for (const st of fn.body.statements) {
      if (!ts.isVariableStatement(st)) continue
      for (const d of st.declarationList.declarations) {
        const call = ts.isIdentifier(d.name) && d.initializer ? maker(d.initializer) : undefined
        if (call) made.set(d.name.text, call)
      }
    }
    if (!made.size) return
    const done = new Set()
    const read = (n) => {
      if (
        ts.isIdentifier(n) &&
        made.has(n.text) &&
        !done.has(n.text) &&
        !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)
      ) {
        done.add(n.text)
        const call = made.get(n.text)
        report(
          'X037',
          call.getStart(sf),
          call.end,
          `\`${n.text}\` is made here, beside the <Boundary> that shows it, so that Boundary never waits for it: no fallback shows, and the content renders before the data. Make it in a component rendered inside the Boundary.`,
        )
      }
      ts.forEachChild(n, read)
    }
    const find = (n) => {
      if (nested(n)) return // another component, with its own body
      if (ts.isJsxElement(n) && n.openingElement.tagName.getText(sf) === 'Boundary')
        n.children.forEach(read)
      else ts.forEachChild(n, find)
    }
    fn.body.statements.forEach(find)
  }
  const visit = (n) => {
    if (
      (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      n.body &&
      ts.isBlock(n.body)
    )
      component(n)
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

/** @param {string} root @param {{ files: { rel: string, text: string }[], exclude?: string[] }} options */
export function stateChecks(root, { files, exclude = [] }) {
  const out = []
  const cache = new Map()
  const checked = new Set(files.map((f) => f.rel))
  // Scopes usually live in plain .ts files, which the compiler pass doesn't read.
  const extra = discover(root, { include: ['src/**/*.ts'], exclude }).filter(
    (f) => !checked.has(f) && !isServerModule(f) && !/\.(d|test|spec)\.ts$/.test(f),
  )
  const all = [
    ...files.map((f) => [f.rel, f.text]),
    ...extra.map((f) => [f, readFileSync(join(root, f), 'utf8')]),
  ]
  for (const [rel, text] of all) {
    const copies = /\b(state|watch|set)\b/.test(text),
      boundary = /\.[jt]sx$/.test(rel) && text.includes('<Boundary')
    if (isServerModule(rel) || !(copies || boundary)) continue
    const sf = ts.createSourceFile(
      rel,
      text,
      ts.ScriptTarget.Latest,
      boundary,
      /\.[jt]sx$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const queries = importedQueries(root, rel, sf, cache)
    const pos = positions(text)
    const report = (code, start, end, why, fix) => {
      const offset = [start, end]
      out.push(
        diagnostic({
          code,
          file: rel,
          span: pos.span(start, end),
          offset,
          why,
          fix: fix && {
            description: fix.description,
            safe: fix.safe,
            edits: fix.edits.map(([a, b, t]) => ({
              file: rel,
              span: pos.span(a, b),
              offset: [a, b],
              text: t,
            })),
          },
        }),
      )
    }
    if (copies && queries.size) scan(rel, text, queries, report)
    if (boundary) madeBesideBoundary(sf, new Set([...queries, ...resourceNames(sf)]), report)
  }
  return out
}
