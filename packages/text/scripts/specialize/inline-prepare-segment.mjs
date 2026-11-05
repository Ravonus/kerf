// Keep each segment's scratch locals inside the loop that resets and consumes them.
import ts from 'typescript'

function inside(node, ancestor) {
  for (let current = node; current; current = current.parent) if (current === ancestor) return true
  return false
}

function scratchEdits(file, body, local) {
  const declaration = body.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((node) => node.name.getText(file) === local)
  if (!declaration || declaration.parent.declarations.length !== 1)
    throw new Error(`preparation scratch declaration changed: ${local}`)
  const references = []
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === local && node !== declaration.name)
      references.push(node)
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(body, visit)
  const assignment = references[0]?.parent
  if (
    !assignment ||
    !ts.isBinaryExpression(assignment) ||
    assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
    assignment.left !== references[0] ||
    !ts.isExpressionStatement(assignment.parent)
  )
    throw new Error(`preparation scratch reset changed: ${local}`)
  const block = assignment.parent.parent,
    loop = block.parent
  if (!ts.isBlock(block) || !ts.isForStatement(loop) || loop.statement !== block)
    throw new Error(`preparation scratch is not reset in the segment loop: ${local}`)
  if (references.some((reference) => !inside(reference, block)))
    throw new Error(`preparation scratch is read outside the segment loop: ${local}`)
  let initializer = declaration.initializer
  while (ts.isAsExpression(initializer)) initializer = initializer.expression
  if (assignment.right.getText(file) !== initializer.getText(file))
    throw new Error(`preparation scratch reset value changed: ${local}`)
  return [
    [declaration.parent.parent.getStart(file), declaration.parent.parent.end, ''],
    [assignment.getStart(file), assignment.end, declaration.parent.getText(file)],
  ]
}

export function scopePreparationSegments(text, fields) {
  const prefix = 'function preparation() {'
  const file = ts.createSourceFile(
    'prepare.ts',
    `${prefix}${text}\n}`,
    ts.ScriptTarget.Latest,
    true,
  )
  const body = file.statements[0].body
  const edits = ['width', 'spacingGraphemeCount', 'fitAdvances'].flatMap((name) => {
    const field = fields.get(name)
    if (!field?.mutable) throw new Error(`preparation scratch field changed: ${name}`)
    return scratchEdits(file, body, field.local)
  })
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0]))
    text = text.slice(0, start - prefix.length) + replacement + text.slice(end - prefix.length)
  const result = ts.createSourceFile(
    'prepare.ts',
    `${prefix}${text}\n}`,
    ts.ScriptTarget.Latest,
    true,
  )
  ts.bindSourceFile(result, {})
  if (result.parseDiagnostics.length || result.bindDiagnostics.length)
    throw new Error('scoped preparation has conflicting bindings')
  return text
}
