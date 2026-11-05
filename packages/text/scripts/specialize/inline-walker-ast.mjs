// Syntax operations shared by the walker inliner and its contract checks.
import ts from 'typescript'

export function moduleFunctions(name, source) {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
  if (file.parseDiagnostics.length) throw new Error(`${name}: cannot parse walker source`)
  const functions = new Map()
  for (const statement of file.statements) {
    const declarations = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations
      : []
    const entries =
      ts.isFunctionDeclaration(statement) && statement.name && statement.body
        ? [[statement.name.text, statement]]
        : declarations
            .filter(
              (node) =>
                ts.isIdentifier(node.name) &&
                node.initializer &&
                ts.isArrowFunction(node.initializer) &&
                ts.isBlock(node.initializer.body),
            )
            .map((node) => [node.name.text, node.initializer])
    for (const [helperName, node] of entries) {
      if (functions.has(helperName)) throw new Error(`duplicate walker helper: ${helperName}`)
      functions.set(helperName, { node, file, source, statement })
    }
  }
  return functions
}

export function parts(functions, name) {
  const item = functions.get(name)
  if (!item) throw new Error(`walker helper missing: ${name}`)
  const { node, file, source, statement } = item
  const block = node.body
  return {
    text: source.slice(block.getStart(file) + 1, block.end - 1),
    node,
    file,
    source,
    statement,
  }
}

export function replaceOnce(text, anchor, replacement) {
  const first = text.indexOf(anchor)
  if (first < 0 || text.indexOf(anchor, first + 1) >= 0)
    throw new Error(`walker anchor is missing or repeated: ${anchor}`)
  return text.slice(0, first) + replacement + text.slice(first + anchor.length)
}

export function replacePattern(text, pattern, replacement) {
  const matches = [...text.matchAll(pattern)]
  if (matches.length !== 1) throw new Error(`walker pattern matched ${matches.length} times`)
  const { index } = matches[0]
  return text.slice(0, index) + replacement + text.slice(index + matches[0][0].length)
}

export function rewriteReturns(text, replacements) {
  const prefix = 'function walkerHelper() {'
  const file = ts.createSourceFile('helper.ts', `${prefix}${text}\n}`, ts.ScriptTarget.Latest, true)
  if (file.parseDiagnostics.length) throw new Error('cannot parse walker helper')
  const edits = [],
    seen = new Set()
  function visit(node) {
    if (ts.isReturnStatement(node)) {
      const value = node.expression?.getText(file)
      if (!Object.hasOwn(replacements, value)) throw new Error(`unexpected walker return: ${value}`)
      if (replacements[value] === '' && seen.has(value))
        throw new Error(`walker fallthrough return repeated: ${value}`)
      seen.add(value)
      edits.push([
        node.getStart(file) - prefix.length,
        node.end - prefix.length,
        replacements[value],
      ])
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(file.statements[0].body, visit)
  for (const key of Object.keys(replacements))
    if (!seen.has(key)) throw new Error(`walker return missing: ${key}`)
  for (const [start, end, replacement] of edits.reverse())
    text = text.slice(0, start) + replacement + text.slice(end)
  return text
}

export function objectParts(functions, name) {
  const item = parts(functions, name)
  const statements = item.node.body.statements
  const last = statements.at(-1)
  if (
    !last ||
    !ts.isReturnStatement(last) ||
    !last.expression ||
    !ts.isObjectLiteralExpression(last.expression)
  )
    throw new Error(`walker object return missing: ${name}`)
  for (const statement of statements.slice(0, -1)) {
    function visit(node) {
      if (ts.isReturnStatement(node)) throw new Error(`early walker object return: ${name}`)
      ts.forEachChild(node, visit)
    }
    visit(statement)
  }
  return {
    before: item.source.slice(item.node.body.getStart(item.file) + 1, last.getStart(item.file)),
    properties: last.expression.properties,
    file: item.file,
  }
}

export function directWrite(node) {
  const parent = node.parent
  if (ts.isBinaryExpression(parent) && parent.left === node)
    return (
      parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    )
  return (
    ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(parent.operator)) ||
    ts.isDeleteExpression(parent)
  )
}
