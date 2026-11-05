import { existsSync } from 'node:fs'
import ts from 'typescript'
import { local } from '../alias.mjs'

const suiteRoots = new Set(['describe', 'suite', 'fdescribe', 'xdescribe'])
const testRoots = new Set(['test', 'it', 'fit', 'xit', 'xtest', ...suiteRoots])
const exts = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.jsx',
  '.mjs',
  '/index.ts',
  '/index.tsx',
  '/index.js',
]

const kindOf = (file) =>
  file.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : file.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : /\.[mc]?ts$/.test(file)
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS
export const parse = (text, file) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file))
export const isFn = (n) =>
  n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n))
export const norm = (n) => n.getText().replace(/\s+/g, ' ').replace(/;$/, '')
export const unwrap = (n) => {
  while (
    n &&
    (ts.isParenthesizedExpression(n) ||
      ts.isAsExpression(n) ||
      ts.isNonNullExpression(n) ||
      ts.isAwaitExpression(n))
  )
    n = n.expression
  return n
}

export function walk(node, visit) {
  const go = (n) => {
    if (visit(n) === false) return
    ts.forEachChild(n, go)
  }
  go(node)
}

export const contains = (node, pred) => {
  let hit = false
  walk(node, (n) => {
    if (hit) return false
    if (pred(n)) hit = true
  })
  return hit
}

/** The identifier at the root of `a.b(…).c`, or undefined. */
export function rootName(expr) {
  let n = expr
  for (;;) {
    n = unwrap(n)
    if (
      ts.isPropertyAccessExpression(n) ||
      ts.isElementAccessExpression(n) ||
      ts.isCallExpression(n)
    )
      n = n.expression
    else break
  }
  return ts.isIdentifier(n) ? n.text : undefined
}

/** `1`, `'a'`, `null`, `[1, { a: 'b' }]`: a value with nothing behind it. */
export function isLiteral(n) {
  n = unwrap(n)
  if (!n) return false
  if (
    ts.isStringLiteral(n) ||
    ts.isNumericLiteral(n) ||
    ts.isBigIntLiteral(n) ||
    ts.isNoSubstitutionTemplateLiteral(n) ||
    ts.isRegularExpressionLiteral(n)
  )
    return true
  if (
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
      n.kind,
    )
  )
    return true
  if (ts.isIdentifier(n)) return n.text === 'undefined' || n.text === 'NaN' || n.text === 'Infinity'
  if (ts.isPrefixUnaryExpression(n)) return isLiteral(n.operand)
  if (ts.isArrayLiteralExpression(n)) return n.elements.every(isLiteral)
  if (ts.isObjectLiteralExpression(n))
    return n.properties.every((p) => ts.isPropertyAssignment(p) && isLiteral(p.initializer))
  return false
}

export const hasCall = (n) =>
  contains(
    n,
    (x) =>
      ts.isCallExpression(x) ||
      ts.isNewExpression(x) ||
      ts.isAwaitExpression(x) ||
      ts.isTaggedTemplateExpression(x),
  )

/** `expect(x)`, `expect.soft(x)`, `t.expect(x)`: the call that takes the subject. */
export function isSubject(call) {
  const c = call.expression
  if (ts.isIdentifier(c)) return c.text === 'expect'
  if (!ts.isPropertyAccessExpression(c)) return false
  if (c.name.text === 'expect') return true
  return (
    ts.isIdentifier(c.expression) &&
    c.expression.text === 'expect' &&
    ['soft', 'poll'].includes(c.name.text)
  )
}

/** For a subject call, the matcher it ends in: `expect(x).not.toBe(1)` → { name: 'toBe', call, not: true }. */
export function matcherOf(subject) {
  let cur = subject
  let not = false
  const mods = []
  for (;;) {
    const p = cur.parent
    if (p && ts.isPropertyAccessExpression(p) && p.expression === cur) {
      const name = p.name.text
      if (p.parent && ts.isCallExpression(p.parent) && p.parent.expression === p)
        return { name, node: p.name, call: p.parent, not, mods }
      if (name === 'not') not = !not
      mods.push(name)
      cur = p
    } else return null
  }
}

/** Test and suite calls, with their modifiers: `test.only.each(table)('x', fn)`. */
export function testCall(call) {
  // The outer call of a curried form (`test.each(t)(…)`) is the test; skip the inner one.
  if (call.parent && ts.isCallExpression(call.parent) && call.parent.expression === call)
    return null
  const mods = []
  let n = call.expression
  for (;;) {
    if (ts.isPropertyAccessExpression(n)) {
      mods.unshift({ name: n.name.text, node: n })
      n = n.expression
    } else if (ts.isCallExpression(n)) n = n.expression
    else break
  }
  if (!ts.isIdentifier(n) || !testRoots.has(n.text)) return null
  const root = n.text
  const fn = [...call.arguments]
    .reverse()
    .find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a))
  // `fit` with no test body is someone's function (@weft-js/core/text's), not a focused test
  if (root === 'fit' && !fn) return null
  return { root, rootNode: n, mods, fn, suite: suiteRoots.has(root), call }
}

/** Functions (by name) whose bodies assert, in one file: local helpers and, given `imported`, what they call. */
export function assertingFunctions(sf, imported = new Set()) {
  const bodies = new Map()
  const add = (name, fn) => fn?.body && bodies.set(name, fn.body)
  for (const st of sf.statements) {
    const decl = ts.isExportDeclaration(st) ? null : st
    if (decl && ts.isFunctionDeclaration(decl) && decl.name) add(decl.name.text, decl)
    if (decl && ts.isVariableStatement(decl))
      for (const d of decl.declarationList.declarations)
        if (ts.isIdentifier(d.name) && isFn(d.initializer)) add(d.name.text, d.initializer)
  }
  const asserting = new Set(imported)
  for (let changed = true; changed;) {
    changed = false
    for (const [name, body] of bodies) {
      if (asserting.has(name) || !asserts(body, asserting)) continue
      asserting.add(name)
      changed = true
    }
  }
  return asserting
}

/** Does this code assert? A matcher, `assert…`, `expect.assertions`, a helper named `expect…`, or a known asserting function. */
export function asserts(node, asserting) {
  return contains(node, (n) => {
    if (!ts.isCallExpression(n)) return false
    if (isSubject(n)) return Boolean(matcherOf(n))
    const c = n.expression
    if (
      ts.isPropertyAccessExpression(c) &&
      ts.isIdentifier(c.expression) &&
      c.expression.text === 'expect'
    )
      return true // expect.assertions(n)
    const name = ts.isIdentifier(c)
      ? c.text
      : ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression)
        ? c.expression.text
        : undefined
    return Boolean(name && (/^(expect|assert)([A-Z_]|$)/.test(name) || asserting.has(name)))
  })
}

export function resolveImport(fromAbs, spec) {
  const base = local(fromAbs, spec)
  if (!base) return null
  for (const e of exts) {
    const p = base + e
    if (existsSync(p) && !p.endsWith('/') && (e || /\.[cm]?[jt]sx?$/.test(p))) return p
  }
  return null
}

export const moduleKey = (abs) => abs.replace(/(\/index)?\.[cm]?[jt]sx?$/, '')
