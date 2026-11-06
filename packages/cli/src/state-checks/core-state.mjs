// Bind identities without loading dependencies or checking project types. Only explicit core
// value imports and stable const aliases establish state provenance; spelling alone does not.
import ts from 'typescript'

function peel(expression) {
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  )
    expression = expression.expression
  return expression
}

const member = (base, name) =>
  base === 'namespace' && name === 'state'
    ? 'state'
    : base === 'state' && ['linked', 'global'].includes(name)
      ? name
      : undefined

function binder(root, graph) {
  const files = new Map([...graph.values()].map(({ sf }) => [sf.fileName, sf]))
  const options = {
    noLib: true,
    noResolve: true,
    types: [],
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
  }
  const host = ts.createCompilerHost(options)
  host.getSourceFile = (file) => files.get(file)
  host.fileExists = (file) => files.has(file)
  host.readFile = (file) => files.get(file)?.text
  host.getCurrentDirectory = () => root
  return ts.createProgram([...files.keys()], options, host).getTypeChecker()
}

function written(node, symbol, out) {
  node = peel(node)
  if (ts.isIdentifier(node)) {
    const sym = symbol(node)
    if (sym) out.add(sym)
  } else if (ts.isArrayLiteralExpression(node))
    for (const element of node.elements)
      written(ts.isSpreadElement(element) ? element.expression : element, symbol, out)
  else if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isShorthandPropertyAssignment(property)) written(property.name, symbol, out)
      if (ts.isPropertyAssignment(property)) written(property.initializer, symbol, out)
      if (ts.isSpreadAssignment(property)) written(property.expression, symbol, out)
    }
  } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken)
    written(node.left, symbol, out)
}

function scanWrites(sf, symbol, writes, aliases) {
  const scan = (node) => {
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind
      if (
        operator === ts.SyntaxKind.EqualsToken ||
        (operator >= ts.SyntaxKind.FirstCompoundAssignment &&
          operator <= ts.SyntaxKind.LastCompoundAssignment)
      )
        written(node.left, symbol, writes)
    }
    if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
      if ([ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator))
        written(node.operand, symbol, writes)
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      node.parent.flags & ts.NodeFlags.Const
    )
      aliases.push(node)
    ts.forEachChild(node, scan)
  }
  scan(sf)
}

/** Resolve state, linked and explicit global calls through local binding identities. */
export function coreState(root, graph) {
  const checker = binder(root, graph)
  const symbol = (node) => {
    const parent = node.parent
    return parent && ts.isShorthandPropertyAssignment(parent) && parent.name === node
      ? checker.getShorthandAssignmentValueSymbol(parent)
      : checker.getSymbolAtLocation(node)
  }
  const values = new Map(),
    writes = new Set(),
    aliases = []
  const remember = (node, tag) => {
    const sym = symbol(node)
    if (sym && tag && !writes.has(sym)) values.set(sym, tag)
  }
  for (const { sf } of graph.values()) {
    scanWrites(sf, symbol, writes, aliases)
    for (const node of sf.statements) {
      if (
        !ts.isImportDeclaration(node) ||
        node.moduleSpecifier.text !== '@weft-js/core' ||
        !node.importClause ||
        node.importClause.isTypeOnly
      )
        continue
      const named = node.importClause.namedBindings
      if (named && ts.isNamespaceImport(named)) remember(named.name, 'namespace')
      if (named && ts.isNamedImports(named))
        for (const spec of named.elements)
          if (!spec.isTypeOnly && (spec.propertyName ?? spec.name).text === 'state')
            remember(spec.name, 'state')
    }
  }
  for (const sym of writes) values.delete(sym)
  const resolve = (expression) => {
    expression = peel(expression)
    if (ts.isIdentifier(expression)) return values.get(symbol(expression))
    if (ts.isPropertyAccessExpression(expression))
      return member(resolve(expression.expression), expression.name.text)
    if (
      ts.isElementAccessExpression(expression) &&
      expression.argumentExpression &&
      ts.isStringLiteralLike(expression.argumentExpression)
    )
      return member(resolve(expression.expression), expression.argumentExpression.text)
    return undefined
  }
  for (let round = 0; round <= aliases.length; round++) {
    const before = values.size
    for (const alias of aliases) {
      const base = resolve(alias.initializer)
      if (!base) continue
      if (ts.isIdentifier(alias.name) && !writes.has(symbol(alias.name))) remember(alias.name, base)
      if (ts.isObjectBindingPattern(alias.name))
        for (const element of alias.name.elements) {
          if (
            !ts.isIdentifier(element.name) ||
            element.initializer ||
            element.dotDotDotToken ||
            writes.has(symbol(element.name))
          )
            continue
          const name = element.propertyName ?? element.name
          if (!ts.isIdentifier(name) && !ts.isStringLiteralLike(name)) continue
          const tag = member(base, name.text)
          remember(element.name, tag)
        }
    }
    if (values.size === before) break
  }
  return (expression) => resolve(expression)
}

// This syntax cannot produce undefined on normal completion. Identifiers, member reads,
// calls and compound expressions remain unknown; type assertions add no runtime evidence.
function nonUndefined(expression) {
  expression = peel(expression)
  return [
    ts.SyntaxKind.NumericLiteral,
    ts.SyntaxKind.BigIntLiteral,
    ts.SyntaxKind.StringLiteral,
    ts.SyntaxKind.NoSubstitutionTemplateLiteral,
    ts.SyntaxKind.RegularExpressionLiteral,
    ts.SyntaxKind.TrueKeyword,
    ts.SyntaxKind.FalseKeyword,
    ts.SyntaxKind.NullKeyword,
    ts.SyntaxKind.ObjectLiteralExpression,
    ts.SyntaxKind.ArrayLiteralExpression,
    ts.SyntaxKind.FunctionExpression,
    ts.SyntaxKind.ArrowFunction,
    ts.SyntaxKind.ClassExpression,
    ts.SyntaxKind.NewExpression,
    ts.SyntaxKind.PrefixUnaryExpression,
    ts.SyntaxKind.PostfixUnaryExpression,
    ts.SyntaxKind.TypeOfExpression,
    ts.SyntaxKind.DeleteExpression,
  ].includes(expression.kind)
}

function iifeDefaults(call, callee, visit) {
  const spread = call.arguments.findIndex(ts.isSpreadElement)
  const fixed = spread < 0 ? call.arguments.length : spread
  // A TypeScript this parameter consumes no positional argument.
  const params = callee.parameters.filter(
    (param) => !ts.isIdentifier(param.name) || param.name.text !== 'this',
  )
  for (const [index, param] of params.entries()) {
    if (param.initializer && (index >= fixed || !nonUndefined(call.arguments[index])))
      visit(param.initializer)
  }
}

/** Walk module evaluation, not deferred factories or instance-field initializers. */
export function moduleCalls(sf, report) {
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      report(node)
      const callee = peel(node.expression)
      if (ts.isFunctionExpression(callee) || ts.isArrowFunction(callee)) {
        iifeDefaults(node, callee, visit)
        // Generator calls create iterators; their bodies wait for iteration.
        if (!ts.isFunctionExpression(callee) || !callee.asteriskToken) visit(callee.body)
      }
    }
    if (ts.isFunctionLike(node)) {
      if (node.name && ts.isComputedPropertyName(node.name)) visit(node.name.expression)
      return
    }
    if (
      ts.isPropertyDeclaration(node) &&
      !node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword)
    ) {
      if (ts.isComputedPropertyName(node.name)) visit(node.name.expression)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}
