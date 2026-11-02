// S001 and S012 in `weft check` (research 14 §3.1, §3.4, research 29 §4): server values copied into state, and
// `state.linked` over one with no `key`. These need to know which imports are queries, so they read the server modules;
// the compiler sees one file at a time. TypeScript's parser only, no type checking, and a name's taint lasts for the
// function it was declared in, so a same-named primitive elsewhere isn't flagged.

import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { local } from './alias.mjs'
import { diagnostic, positions } from './diag.mjs'
import { discover } from './files.mjs'

const isServerModule = rel => rel.startsWith('src/server/') || /\.server\.[cm]?[jt]sx?$/.test(rel)
const KEEPS_OBJECTS = new Set(['map', 'filter', 'flatMap', 'slice', 'sort', 'toSorted', 'reverse', 'concat', 'find', 'at', 'structuredClone'])
const ESCAPES = new Set(['untrack', 'optimistic'])

/** `export const name = query(` in a module: the names of its queries. */
const queriesOf = text => new Set([...text.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*query\s*\(/g)].map(m => m[1]))

function moduleFile(root, from, spec) {
  const abs = local(join(root, from), spec)
  if (!abs) return undefined
  const base = relative(root, abs).split('\\').join('/').replace(/\.js$/, '')
  return ['', '.ts', '.tsx', '.mts', '.js', '/index.ts'].map(x => base + x).find(f => /\.[cm]?[jt]sx?$/.test(f) && existsSync(join(root, f)))
}

/** Local names of the queries `sf` imports from server modules. */
function importedQueries(root, rel, sf, cache) {
  const out = new Set()
  for (const n of sf.statements) {
    if (!ts.isImportDeclaration(n) || !n.importClause?.namedBindings || !ts.isNamedImports(n.importClause.namedBindings)) continue
    const file = moduleFile(root, rel, n.moduleSpecifier.text)
    if (!file || !isServerModule(file)) continue
    if (!cache.has(file)) cache.set(file, queriesOf(readFileSync(join(root, file), 'utf8')))
    for (const s of n.importClause.namedBindings.elements) if (cache.get(file).has((s.propertyName ?? s.name).text)) out.add(s.name.text)
  }
  return out
}

function scan(rel, text, queries, report) {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const frames = [{ handles: new Set(), values: new Set() }]
  const has = (kind, name) => frames.some(f => f[kind].has(name))
  const peel = e => { while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression; return e }

  const isQueryCall = e => ts.isCallExpression(e) && (ts.isIdentifier(e.expression) ? queries.has(e.expression.text) : ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'live' && ts.isIdentifier(e.expression.expression) && queries.has(e.expression.expression.text))
  const isFetch = e => ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'fetch' && ts.isIdentifier(e.expression.expression) && queries.has(e.expression.expression.text)
  const isHandle = e => { e = peel(e); return isQueryCall(e) || (ts.isIdentifier(e) && has('handles', e.text)) }

  /** The expression holds a whole server object or array, or a derived copy of one. A picked field isn't one. */
  function serverValue(e) {
    e = peel(e)
    if (ts.isIdentifier(e)) return has('values', e.text)
    if (ts.isAwaitExpression(e)) return isFetch(peel(e.expression)) || isQueryCall(peel(e.expression))
    if (ts.isPropertyAccessExpression(e)) return e.name.text === 'value' && isHandle(e.expression)
    if (ts.isElementAccessExpression(e)) return serverValue(e.expression)
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)) return serverValue(e.left) || serverValue(e.right)
    if (ts.isConditionalExpression(e)) return serverValue(e.whenTrue) || serverValue(e.whenFalse)
    if (ts.isCallExpression(e)) {
      const c = e.expression
      return ts.isPropertyAccessExpression(c) && KEEPS_OBJECTS.has(c.name.text) && serverValue(c.expression)
    }
    if (ts.isArrayLiteralExpression(e)) return e.elements.some(x => ts.isSpreadElement(x) && serverValue(x.expression))
    if (ts.isObjectLiteralExpression(e)) return e.properties.some(p => ts.isSpreadAssignment(p) && serverValue(p.expression))
    return false
  }

  const returned = fn => {
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return undefined
    if (!ts.isBlock(fn.body)) return fn.body
    const r = fn.body.statements.find(ts.isReturnStatement)
    return r?.expression
  }
  /** The first handle a function's body reads: the source `state.linked` follows. */
  function handleIn(node) {
    /** @type {string | undefined} */
    let found
    const walk = n => {
      if (found) return
      if (ts.isPropertyAccessExpression(n) && n.name.text === 'value' && isHandle(n.expression)) found = n.expression.getText(sf)
      else ts.forEachChild(n, walk)
    }
    walk(node)
    return found
  }
  const flag = (node, why) => report('S001', node.getStart(sf), node.end, why)

  function visit(node) {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && ESCAPES.has(node.name.text)) return
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && ESCAPES.has(node.name.text)) return
    const fn = ts.isFunctionLike(node)
    if (fn) frames.push({ handles: new Set(), values: new Set() })
    try {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const init = peel(node.initializer)
        if (isQueryCall(init)) frames.at(-1).handles.add(node.name.text)
        else if (serverValue(init)) frames.at(-1).values.add(node.name.text)
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'value' && serverValue(node.right))
        flag(node, `A server value is copied into \`${node.left.expression.getText(sf)}\`: the copy goes stale, and its rows lose their identity.`)
      if (ts.isCallExpression(node)) {
        const c = node.expression
        if (ts.isIdentifier(c) && ESCAPES.has(c.text)) return
        if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === 'state' && c.name.text === 'linked') {
          const source = handleIn(node.arguments[0] ?? node)
          if (source && node.arguments.length < 2) {
            const at = node.arguments[0].end
            report('S012', node.getStart(sf), node.end, `\`state.linked\` over \`${source}\` has no \`key\`: a refetch resets what someone is typing.`,
              { description: `Key it by the row: \`{ key: () => ${source}.value?.id }\``, safe: false, edits: [[at, at, `, { key: () => ${source}.value?.id }`]] })
          }
          return // the declared editing path: not S001
        }
        if (ts.isIdentifier(c) && c.text === 'state' && node.arguments[0] && serverValue(node.arguments[0]))
          flag(node, 'A server value is copied into `state`: the copy goes stale, and its rows lose their identity.')
        if (ts.isPropertyAccessExpression(c) && c.name.text === 'set' && node.arguments.length === 1) {
          const r = returned(node.arguments[0])
          if (r && serverValue(r)) flag(node, `A server value is copied into \`${c.expression.getText(sf)}\`: the copy goes stale, and its rows lose their identity.`)
        }
        // The value a callback gets from a query: `watch(() => q.value, v => …)`, `q.fetch().then(v => …)`.
        const fed = ts.isIdentifier(c) && c.text === 'watch' && returned(node.arguments[0]) && serverValue(returned(node.arguments[0])) ? node.arguments[1]
          : ts.isPropertyAccessExpression(c) && c.name.text === 'then' && isFetch(peel(c.expression)) ? node.arguments[0] : undefined
        if (fed && (ts.isArrowFunction(fed) || ts.isFunctionExpression(fed)) && ts.isIdentifier(fed.parameters[0]?.name)) {
          frames.push({ handles: new Set(), values: new Set([fed.parameters[0].name.text]) })
          ts.forEachChild(node, visit)
          frames.pop()
          return
        }
      }
      ts.forEachChild(node, visit)
    } finally {
      if (fn) frames.pop()
    }
  }
  visit(sf)
}

/** @param {string} root @param {{ files: { rel: string, text: string }[], exclude?: string[] }} options */
export function stateChecks(root, { files, exclude = [] }) {
  const out = []
  const cache = new Map()
  const checked = new Set(files.map(f => f.rel))
  // Scopes usually live in plain .ts files, which the compiler pass doesn't read.
  const extra = discover(root, { include: ['src/**/*.ts'], exclude }).filter(f => !checked.has(f) && !isServerModule(f) && !/\.(d|test|spec)\.ts$/.test(f))
  const all = [...files.map(f => [f.rel, f.text]), ...extra.map(f => [f, readFileSync(join(root, f), 'utf8')])]
  for (const [rel, text] of all) {
    if (isServerModule(rel) || !/\b(state|watch|set)\b/.test(text)) continue
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, false, /\.[jt]sx$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const queries = importedQueries(root, rel, sf, cache)
    if (!queries.size) continue
    const pos = positions(text)
    scan(rel, text, queries, (code, start, end, why, fix) => {
      const offset = [start, end]
      out.push(diagnostic({ code, file: rel, span: pos.span(start, end), offset, why, fix: fix && { description: fix.description, safe: fix.safe, edits: fix.edits.map(([a, b, t]) => ({ file: rel, span: pos.span(a, b), offset: [a, b], text: t })) } }))
    })
  }
  return out
}
