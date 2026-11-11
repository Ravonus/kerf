import ts from 'typescript'
import {
  contains,
  hasCall,
  isFn,
  isLiteral,
  isSubject,
  matcherOf,
  norm,
  unwrap,
} from './syntax.mjs'

export const sameValueMatchers = new Set(['toBe', 'toEqual', 'toStrictEqual'])
const loopCallbacks = new Set([
  'forEach',
  'map',
  'flatMap',
  'filter',
  'some',
  'every',
  'find',
  'findIndex',
  'reduce',
])
export const isComparison = (b) =>
  [
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
  ].includes(b.operatorToken.kind)

/** Why `node`, under ancestor `a`, only runs sometimes (`loop`: maybe zero times); undefined when it always runs. */
export function conditional(a, node) {
  const within = (x) => x && node.getStart() >= x.getStart() && node.getEnd() <= x.getEnd()
  const when = (text) => ({ text })
  const loop = (text) => ({ text, loop: true })
  if (ts.isIfStatement(a) && !within(a.expression)) return when('when the `if` matches')
  if (ts.isConditionalExpression(a) && !within(a.condition)) return when('on one side of a `?:`')
  if (
    ts.isBinaryExpression(a) &&
    [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(a.operatorToken.kind) &&
    within(a.right)
  )
    return when(`after a \`${a.operatorToken.getText()}\``)
  if (ts.isCaseClause(a) || ts.isDefaultClause(a)) return when('in one `switch` case')
  if (ts.isCatchClause(a)) return when('when something throws')
  if (
    (ts.isForStatement(a) ||
      ts.isForOfStatement(a) ||
      ts.isForInStatement(a) ||
      ts.isWhileStatement(a) ||
      ts.isDoStatement(a)) &&
    within(a.statement)
  )
    return loop('inside a loop, and zero iterations check nothing')
  if (
    isFn(a) &&
    ts.isCallExpression(a.parent) &&
    ts.isPropertyAccessExpression(a.parent.expression) &&
    loopCallbacks.has(a.parent.expression.name.text) &&
    a.parent.arguments.includes(a)
  )
    return loop(`inside \`.${a.parent.expression.name.text}\`, and an empty list checks nothing`)
  return undefined
}

/** `expect(cart.items.value)` with `cart` imported from app code, in a component test. (`scope(cart)` from @kerf-js/core/test is the way to test a scope.) */
export function readsInternalState(subject, imports) {
  const s = unwrap(subject)
  if (!ts.isPropertyAccessExpression(s) || s.name.text !== 'value') return false
  let n = s.expression
  for (;;) {
    n = unwrap(n)
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) n = n.expression
    else break
  }
  return ts.isIdentifier(n) && Boolean(imports.get(n.text)?.abs)
}

/** `new Promise(r => setTimeout(r, ms))`: the timer call's enclosing sleep, or undefined. */
export function sleepPromise(timer) {
  const cb = timer.arguments[0]
  let exec = timer.parent
  while (exec && (ts.isExpressionStatement(exec) || ts.isBlock(exec))) exec = exec.parent
  if (
    !isFn(exec) ||
    !ts.isNewExpression(exec.parent) ||
    exec.parent.expression.getText() !== 'Promise'
  )
    return undefined
  const resolveName = exec.parameters[0]?.name.getText()
  const callsResolve =
    cb &&
    (cb.getText() === resolveName ||
      (isFn(cb) &&
        contains(cb.body, (x) => ts.isCallExpression(x) && x.expression.getText() === resolveName)))
  if (!callsResolve) return undefined
  // A fake API's latency resolves with data (`ok(user)`); a sleep resolves with nothing.
  if (
    isFn(cb) &&
    contains(
      cb.body,
      (x) =>
        ts.isCallExpression(x) && x.expression.getText() === resolveName && x.arguments.length > 0,
    )
  )
    return undefined
  return exec.parent
}

/** Timers inside a function that a fake API returns (`load: id => new Promise(ok => setTimeout(() => ok(x), ms))`). */
export function insideFakeApi(timer) {
  for (let n = timer.parent; n; n = n.parent) {
    if (ts.isNewExpression(n) && n.expression.getText() === 'Promise') return true
  }
  return false
}

/** Replace a zero-delay sleep with `flush()`, importing it from @kerf-js/core/test when the file doesn't. */
export function flushFix(sf, sleep, edit) {
  const edits = [edit(sleep.getStart(sf), sleep.getEnd(), 'flush()')]
  const hasFlush = sf.statements.some(
    (st) =>
      ts.isImportDeclaration(st) &&
      st.importClause?.namedBindings &&
      ts.isNamedImports(st.importClause.namedBindings) &&
      st.importClause.namedBindings.elements.some((e) => e.name.text === 'flush'),
  )
  if (!hasFlush) {
    const kerfTest = sf.statements.find(
      (st) =>
        ts.isImportDeclaration(st) &&
        ts.isStringLiteral(st.moduleSpecifier) &&
        st.moduleSpecifier.text === '@kerf-js/core/test' &&
        st.importClause?.namedBindings &&
        ts.isNamedImports(st.importClause.namedBindings),
    )
    if (kerfTest) {
      const el = kerfTest.importClause.namedBindings.elements
      edits.push(edit(el[el.length - 1].getEnd(), el[el.length - 1].getEnd(), ', flush'))
    } else {
      const last = [...sf.statements].reverse().find((st) => ts.isImportDeclaration(st))
      const at = last ? last.getEnd() : 0
      edits.push(
        edit(
          at,
          at,
          `${last ? '\n' : ''}import { flush } from '@kerf-js/core/test'${last ? '' : '\n'}`,
        ),
      )
    }
  }
  return { description: 'Replace the sleep with `flush()`', safe: false, edits }
}

/**
 * T003 in one test body: `n.value = 5; expect(n.value).toBe(5)`, or `const s = state(3); expect(s.value).toBe(3)`.
 * Any call between the write and the assertion (a click, a render, a fake push) may route through the app, so it ends
 * the check; `flush()` doesn't.
 */
export function assertsWhatItSet(statements, report) {
  const writes = new Map()
  const boxes = new Set() // `const n = state(…)`: a plain box, so a write reads straight back
  const locals = new Set()
  const isFlush = (st) => {
    const e = ts.isExpressionStatement(st) ? unwrap(st.expression) : null
    return e && ts.isCallExpression(e) && e.expression.getText() === 'flush'
  }
  for (const st of statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue
        const init = unwrap(d.initializer)
        locals.add(d.name.text)
        if (ts.isCallExpression(init) && init.expression.getText() === 'state')
          boxes.add(d.name.text)
        if (isLiteral(init)) writes.set(d.name.text, init)
        else if (
          ts.isCallExpression(init) &&
          init.expression.getText() === 'state' &&
          init.arguments[0] &&
          isLiteral(init.arguments[0])
        )
          writes.set(`${d.name.text}.value`, init.arguments[0])
        else if (hasCall(init)) writes.clear()
      }
      continue
    }
    if (isFlush(st)) continue
    const e = ts.isExpressionStatement(st) ? unwrap(st.expression) : null
    if (
      e &&
      ts.isBinaryExpression(e) &&
      e.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      !hasCall(e.left)
    ) {
      const target = norm(e.left)
      const plain =
        (ts.isIdentifier(e.left) && locals.has(target)) ||
        (ts.isPropertyAccessExpression(e.left) &&
          e.left.name.text === 'value' &&
          boxes.has(norm(e.left.expression)))
      if (isLiteral(e.right) && plain) writes.set(target, e.right)
      else writes.delete(target)
      if (hasCall(e.right)) writes.clear()
      continue
    }
    const subject = e && findSubject(e)
    if (subject) {
      const m = matcherOf(subject)
      const written = subject.arguments[0] && writes.get(norm(subject.arguments[0]))
      if (
        m &&
        !m.not &&
        sameValueMatchers.has(m.name) &&
        written &&
        m.call.arguments[0] &&
        norm(m.call.arguments[0]) === norm(written)
      )
        report(
          'T003',
          m.call,
          `The test set \`${norm(subject.arguments[0])}\` to \`${norm(written)}\` itself and asserts it back: nothing between went through the UI or the graph.`,
        )
      continue
    }
    writes.clear()
  }
}

/** The subject call of a statement that is one assertion chain (`expect(a).toBe(b)`), else undefined. */
function findSubject(e) {
  let n = unwrap(e)
  for (;;) {
    if (ts.isCallExpression(n) && isSubject(n)) return n
    if (ts.isCallExpression(n) || ts.isPropertyAccessExpression(n)) n = unwrap(n.expression)
    else return undefined
  }
}
