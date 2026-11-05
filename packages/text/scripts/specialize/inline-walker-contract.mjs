// Reject helper shapes whose scope or returns cannot be inlined safely.
import ts from 'typescript'
import { parts, directWrite } from './inline-walker-ast.mjs'

function containsBinding(node, bindings) {
  if (ts.isIdentifier(node)) return bindings.has(node.text)
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return false
  return !!ts.forEachChild(node, (child) => containsBinding(child, bindings) || undefined)
}

function writesBinding(node, bindings) {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  )
    return containsBinding(node.left, bindings)
  if (
    (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
    !ts.isVariableDeclarationList(node.initializer)
  )
    return containsBinding(node.initializer, bindings)
  return false
}

function verifyHelper(functions, name, parameters, finalReturn) {
  const { node, file } = parts(functions, name)
  const actual = node.parameters.map((parameter) => parameter.name.getText(file)).join(', ')
  if (actual !== parameters) throw new Error(`walker parameters changed: ${name}`)
  if (
    node.asteriskToken ||
    node.typeParameters?.length ||
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
    node.parameters.some(
      (parameter) => parameter.initializer || parameter.dotDotDotToken || parameter.questionToken,
    )
  )
    throw new Error(`walker helper binding changed: ${name}`)
  const bindings = new Set(node.parameters.map((parameter) => parameter.name.getText(file)))
  function visit(child) {
    if (
      ts.isFunctionLike(child) ||
      child.kind === ts.SyntaxKind.ThisKeyword ||
      child.kind === ts.SyntaxKind.SuperKeyword ||
      ts.isMetaProperty(child) ||
      (ts.isIdentifier(child) && child.text === 'arguments')
    )
      throw new Error(`walker helper scope changed: ${name}`)
    if (
      (ts.isIdentifier(child) && bindings.has(child.text) && directWrite(child)) ||
      writesBinding(child, bindings)
    )
      throw new Error(`walker parameter is assigned: ${name}`)
    ts.forEachChild(child, visit)
  }
  ts.forEachChild(node.body, visit)
  if (finalReturn !== undefined) {
    const last = node.body.statements.at(-1)
    if (!last || !ts.isReturnStatement(last) || last.expression?.getText(file) !== finalReturn)
      throw new Error(`walker final return changed: ${name}`)
  }
}

function verifyNoReturns(functions, name) {
  const { node } = parts(functions, name)
  function visit(child) {
    if (ts.isReturnStatement(child)) throw new Error(`unexpected walker return: ${name}`)
    ts.forEachChild(child, visit)
  }
  ts.forEachChild(node.body, visit)
}

export function verifyHelpers(functions, stateFunctions) {
  const state = 'state',
    segment = 'state, i',
    fitting = 'state, i, newFitW'
  for (const name of ['recordSoftHyphen', 'measureComplexFit'])
    verifyHelper(functions, name, segment)
  for (const name of ['initializeComplexSegment', 'admitFirstSegment', 'finishHangingOverflow'])
    verifyHelper(functions, name, segment, 'false')
  for (const name of ['retreatBeforeHardBreak', 'admitFollowingSegment'])
    verifyHelper(functions, name, segment, '0')
  verifyHelper(functions, 'recordFittingSegment', fitting, '-2')
  verifyHelper(functions, 'segmentOverflows', fitting, 'overflows')
  verifyHelper(functions, 'scanComplexSegment', segment, '-2')
  verifyHelper(functions, 'decideComplexLine', state)
  verifyHelper(functions, 'finishComplexLine', state)
  verifyHelper(functions, 'walkComplexLine', state, 'state.lineWidth')
  for (const name of [
    'recordSoftHyphen',
    'measureComplexFit',
    'decideComplexLine',
    'finishComplexLine',
  ])
    verifyNoReturns(functions, name)
  verifyHelper(stateFunctions, 'makeWalkState', 'prepared, cursor, maxWidth')
  verifyHelper(
    stateFunctions,
    'getWalkProfile',
    'prepared, items, maxWidth, discretionaryHyphenWidth',
  )
  verifyHelper(stateFunctions, 'initialLineState', '')
  verifyHelper(stateFunctions, 'initialSegmentState', '')
}
