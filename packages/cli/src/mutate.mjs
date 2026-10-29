// Mutants on the changed lines of a source file (the gate's T011). weft mutates source text, not compiled output, so
// each mutant goes through the weft compiler like any edit and its W-codes still apply. Operators follow Stryker's
// common set: equality, boundaries, logic, arithmetic, negation, literals, conditions, removed calls, JSX text.

import ts from 'typescript'
import { positions } from './diag.mjs'
import { parse } from './tests.mjs'

const K = ts.SyntaxKind
const swaps = new Map([
  [K.EqualsEqualsEqualsToken, ['!==']], [K.ExclamationEqualsEqualsToken, ['===']],
  [K.EqualsEqualsToken, ['!=']], [K.ExclamationEqualsToken, ['==']],
  [K.LessThanToken, ['<=', '>=']], [K.LessThanEqualsToken, ['<', '>']],
  [K.GreaterThanToken, ['>=', '<=']], [K.GreaterThanEqualsToken, ['>', '<']],
  [K.AmpersandAmpersandToken, ['||']], [K.BarBarToken, ['&&']], [K.QuestionQuestionToken, ['&&']],
  [K.PlusToken, ['-']], [K.MinusToken, ['+']], [K.AsteriskToken, ['/']], [K.SlashToken, ['*']], [K.PercentToken, ['*']],
])

/** Lines (1-based) of `after` that are new or changed since `before` (null: every line). LCS over lines. */
export function changedLines(before, after) {
  const b = after.split('\n')
  if (before == null) return new Set(b.map((_, i) => i + 1))
  const a = before.split('\n')
  // Trim the common head and tail; the middle is usually small.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let ea = a.length, eb = b.length
  while (ea > start && eb > start && a[ea - 1] === b[eb - 1]) { ea--; eb-- }
  const A = a.slice(start, ea), B = b.slice(start, eb)
  const out = new Set()
  if (A.length * B.length > 4e6) { for (let i = start; i < eb; i++) out.add(i + 1); return out }
  const dp = Array.from({ length: A.length + 1 }, () => new Uint32Array(B.length + 1))
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  let i = 0, j = 0
  while (j < B.length) {
    if (i < A.length && A[i] === B[j]) { i++; j++ }
    else if (i < A.length && dp[i + 1][j] >= dp[i][j + 1]) i++
    else out.add(start + ++j)
  }
  return out
}

/**
 * Mutants whose code starts on one of `lines`.
 * @returns {{ id: string, file: string, line: number, column: number, op: string, start: number, end: number, original: string, replacement: string }[]}
 */
export function mutants(text, rel, lines) {
  const sf = parse(text, rel)
  const pos = positions(text)
  const out = []
  const add = (node, op, replacement, start = node.getStart(sf), end = node.getEnd()) => {
    const [line, column] = pos.lineCol(start)
    if (!lines.has(line)) return
    const original = text.slice(start, end)
    if (original === replacement) return
    out.push({ id: `${rel}:${line}:${column}:${op}:${out.length}`, file: rel, line, column, op, start, end, original, replacement })
  }
  const skip = n => ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isEnumDeclaration(n)
  const visit = n => {
    if (skip(n)) return
    if (ts.isBinaryExpression(n)) {
      for (const r of swaps.get(n.operatorToken.kind) ?? []) add(n.operatorToken, 'operator', r)
    } else if (ts.isPrefixUnaryExpression(n) && n.operator === K.ExclamationToken) {
      add(n, 'negation', n.operand.getText(sf))
    } else if (n.kind === K.TrueKeyword || n.kind === K.FalseKeyword) {
      add(n, 'boolean', n.kind === K.TrueKeyword ? 'false' : 'true')
    } else if (ts.isNumericLiteral(n)) {
      const v = Number(n.text)
      if (Number.isFinite(v)) add(n, 'number', String(v === 0 ? 1 : v + 1))
    } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text && !isKey(n)) {
      add(n, 'string', '""')
    } else if (ts.isConditionalExpression(n)) {
      add(n.condition, 'condition', 'true')
      add(n.condition, 'condition', 'false')
    } else if (ts.isIfStatement(n)) {
      add(n.expression, 'condition', 'true')
      add(n.expression, 'condition', 'false')
    } else if (ts.isExpressionStatement(n) && ts.isCallExpression(unparen(n.expression)) && !isDirective(n)) {
      add(n, 'call', ';')
    } else if (ts.isJsxText(n) && n.text.trim()) {
      const start = n.pos + n.text.indexOf(n.text.trim()) // JSX text: `text` starts at `pos`, before any trivia
      add(n, 'jsx-text', '', start, start + n.text.trim().length)
    } else if (ts.isReturnStatement(n) && n.expression && isFn(n.parent?.parent) && !ts.isJsxElement(unparen(n.expression)) && !ts.isJsxFragment(unparen(n.expression))) {
      add(n.expression, 'return', 'undefined')
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

const unparen = n => { while (ts.isParenthesizedExpression(n)) n = n.expression; return n }
const isFn = n => n && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n))
const isDirective = n => ts.isStringLiteral(n.expression)
/** Strings that name things rather than being data: property keys, element-access keys, `import()` specifiers. */
const isKey = n => {
  const p = n.parent
  return (ts.isPropertyAssignment(p) && p.name === n) || ts.isElementAccessExpression(p) || ts.isLiteralTypeNode(p) || ts.isExternalModuleReference(p) ||
    (ts.isCallExpression(p) && p.expression.kind === K.ImportKeyword) || ts.isJsxAttribute(p) && /^(key|class|className|style|id|type|role|for|htmlFor|name)$/.test(p.name.getText())
}

export const apply = (text, m) => text.slice(0, m.start) + m.replacement + text.slice(m.end)

/** Spread a sample over lines: one mutant per line in turn, deterministic. */
export function sample(list, max) {
  if (list.length <= max) return list
  const byLine = new Map()
  for (const m of list) {
    const k = `${m.file}:${m.line}`
    if (!byLine.has(k)) byLine.set(k, [])
    byLine.get(k).push(m)
  }
  const queues = [...byLine.values()]
  const out = []
  for (let round = 0; out.length < max; round++) {
    let any = false
    for (const q of queues) if (q[round]) { out.push(q[round]); any = true; if (out.length >= max) break }
    if (!any) break
  }
  return out
}

/** What a test that kills this mutant would check: the hint surviving mutants come back with (MUTGEN/ACH loop). */
export function suggest(m) {
  const at = `${m.file}:${m.line}`
  switch (m.op) {
    case 'operator':
      if (/^[<>]=?$/.test(m.original)) return `${at}: \`${m.original}\` → \`${m.replacement}\` survives. Assert the boundary: the value exactly at the limit.`
      if (/^(&&|\|\||\?\?)$/.test(m.original)) return `${at}: \`${m.original}\` → \`${m.replacement}\` survives. Assert a case where only one side of the condition holds.`
      if (/^[!=]=/.test(m.original)) return `${at}: \`${m.original}\` → \`${m.replacement}\` survives. Assert both the matching and the non-matching case.`
      return `${at}: \`${m.original}\` → \`${m.replacement}\` survives. Assert the computed value, not only that something rendered.`
    case 'boolean': case 'condition': case 'negation':
      return `${at}: \`${m.original}\` → \`${m.replacement}\` survives. Assert what the user sees on the branch this condition guards.`
    case 'number': return `${at}: ${m.original} → ${m.replacement} survives. Assert the exact value this number produces.`
    case 'string': case 'jsx-text': return `${at}: the text ${JSON.stringify(m.original.slice(0, 40))} can be blanked. Assert the text the user sees.`
    case 'call': return `${at}: removing \`${m.original.slice(0, 60)}\` survives. Assert the effect of that call.`
    case 'return': return `${at}: returning undefined survives. Assert what this function's result shows.`
    default: return `${at}: ${m.op} survives`
  }
}
