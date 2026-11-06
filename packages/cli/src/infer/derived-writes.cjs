// W007 maps only TypeScript's readonly write error on a proven core Derived.value.
const { coreMembers, known } = require('./core-boxes.cjs')

function derivedSymbol(ts, checker, symbol, roots, seen = new Set()) {
  if (!symbol || seen.has(symbol)) return false
  seen.add(symbol)
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
  if (roots.has(symbol)) return true
  return (symbol.getDeclarations() ?? []).some((declaration) => {
    if (!ts.isTypeAliasDeclaration(declaration)) return false
    let type = declaration.type
    while (ts.isParenthesizedTypeNode(type)) type = type.type
    return (
      ts.isTypeReferenceNode(type) &&
      derivedSymbol(ts, checker, checker.getSymbolAtLocation(type.typeName), roots, seen)
    )
  })
}

function derivedType(ts, checker, type, roots) {
  if (!known(ts, type)) return false
  if (type.isUnion()) return type.types.every((part) => derivedType(ts, checker, part, roots))
  if (type.isIntersection()) return type.types.some((part) => derivedType(ts, checker, part, roots))
  if (
    derivedSymbol(ts, checker, type.aliasSymbol, roots) ||
    derivedSymbol(ts, checker, type.getSymbol(), roots)
  )
    return true
  return (
    !!type.isClassOrInterface?.() &&
    checker.getBaseTypes(type).some((base) => derivedType(ts, checker, base, roots))
  )
}

function writeTarget(ts, node) {
  for (let parent = node.parent; parent; node = parent, parent = parent.parent) {
    if (ts.isBinaryExpression(parent) && parent.left === node) {
      const operator = parent.operatorToken.kind
      return (
        operator === ts.SyntaxKind.EqualsToken ||
        (operator >= ts.SyntaxKind.FirstCompoundAssignment &&
          operator <= ts.SyntaxKind.LastCompoundAssignment)
      )
    }
    if (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent))
      return (
        parent.operand === node &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator)
      )
    if (ts.isForOfStatement(parent) || ts.isForInStatement(parent))
      return parent.initializer === node
    const wrapped =
      ts.isParenthesizedExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isTypeAssertionExpression(parent)
    const wrapper = wrapped && parent.expression === node
    const pattern =
      ts.isArrayLiteralExpression(parent) ||
      ts.isObjectLiteralExpression(parent) ||
      (ts.isPropertyAssignment(parent) && parent.initializer === node) ||
      (ts.isSpreadElement(parent) && parent.expression === node) ||
      (ts.isSpreadAssignment(parent) && parent.expression === node)
    if (!wrapper && !pattern) return false
  }
  return false
}

/** Remap actual readonly assignments; ambiguous receivers and projections keep TS2540. */
function derivedWrite(ts, program, diagnostic) {
  if (diagnostic.code !== 2540 || !diagnostic.file || diagnostic.start === undefined) return null
  let node = ts.getTokenAtPosition(diagnostic.file, diagnostic.start)
  while (node && !ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node))
    node = node.parent
  if (!node || !writeTarget(ts, node)) return null
  const name = ts.isPropertyAccessExpression(node)
    ? node.name
    : node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)
      ? node.argumentExpression
      : null
  if (name?.text !== 'value') return null
  const checker = program.getTypeChecker()
  const roots = coreMembers(ts, program, checker).derivedRoots
  if (!derivedType(ts, checker, checker.getTypeAtLocation(node.expression), roots)) return null
  return {
    code: 'W007',
    severity: 'error',
    why: 'This writes a core Derived.value; derived values are readonly computations.',
    help:
      'Use `state(initial)` or `state.linked(() => source)` when independent writes are intended. ' +
      'Otherwise keep `derived(() => expression)` pure and update its source state instead.',
  }
}

module.exports = { derivedWrite }
