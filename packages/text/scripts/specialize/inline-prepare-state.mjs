// Replace only the fresh, nonescaping measurement object's own data fields with locals.
import ts from 'typescript'
import { directWrite, objectParts } from './inline-walker-ast.mjs'

function pureInitializer(value) {
  if (ts.isAsExpression(value)) return pureInitializer(value.expression)
  return (
    ts.isNumericLiteral(value) ||
    [ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(
      value.kind,
    ) ||
    (ts.isIdentifier(value) && value.text === 'noExtraSpacings') ||
    (ts.isPrefixUnaryExpression(value) &&
      value.operator === ts.SyntaxKind.ExclamationToken &&
      ts.isIdentifier(value.operand) &&
      value.operand.text === 'hasLetterSpacing')
  )
}

export function preparationState(functions) {
  const state = objectParts(functions, 'createMeasurement')
  const fields = new Map(),
    initializers = [],
    seen = new Set()
  for (const [index, property] of state.properties.entries()) {
    if (!property.name || !ts.isIdentifier(property.name))
      throw new Error('preparation state field changed')
    const key = property.name.text
    if (seen.has(key)) throw new Error(`duplicate preparation field: ${key}`)
    seen.add(key)
    if (ts.isShorthandPropertyAssignment(property)) {
      if (property.objectAssignmentInitializer) throw new Error('preparation field has a default')
      fields.set(key, { local: key, mutable: false })
    } else if (ts.isPropertyAssignment(property) && pureInitializer(property.initializer)) {
      if (['unspaced', 'extraSpacings'].includes(key)) continue
      const local = key
      fields.set(key, { local, mutable: true })
      initializers.push({ index, local, value: property.initializer.getText(state.file) })
    } else throw new Error(`preparation state initializer changed: ${key}`)
  }
  return { setup: orderedInitializers(state, initializers), fields }
}

function orderedInitializers(state, initializers) {
  const prefix = 'function preparation() {'
  const file = ts.createSourceFile(
    'setup.ts',
    `${prefix}${state.before}\n}`,
    ts.ScriptTarget.Latest,
    true,
  )
  const declarations = new Map()
  for (const statement of file.statements[0].body.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations)
      if (ts.isIdentifier(declaration.name))
        declarations.set(declaration.name.text, statement.getStart(file) - prefix.length)
  }
  const insertions = new Map()
  for (const { index, local, value } of initializers) {
    const following = state.properties
      .slice(index + 1)
      .find(
        (property) =>
          ts.isShorthandPropertyAssignment(property) && declarations.has(property.name.text),
      )
    const at = following ? declarations.get(following.name.text) : state.before.length
    if (
      value.includes('hasLetterSpacing') &&
      (!declarations.has('hasLetterSpacing') || declarations.get('hasLetterSpacing') >= at)
    )
      throw new Error('preparation initializer precedes its input')
    const statements = insertions.get(at) ?? []
    statements.push(`\nlet ${local} = ${value}\n`)
    insertions.set(at, statements)
  }
  let setup = state.before
  for (const [at, statements] of [...insertions].sort((a, b) => b[0] - a[0]))
    setup = setup.slice(0, at) + statements.join('') + setup.slice(at)
  return setup
}

function destructuredState(node, fields, file) {
  if (
    node.declarationList.declarations.length !== 1 ||
    !(node.declarationList.flags & ts.NodeFlags.Const)
  )
    throw new Error('preparation destructuring changed')
  const declaration = node.declarationList.declarations[0]
  return declaration.name.elements
    .map((element) => {
      if (element.propertyName || element.dotDotDotToken || element.initializer)
        throw new Error('preparation destructuring is not shorthand')
      const key = element.name.getText(file),
        field = fields.get(key)
      if (!field) throw new Error(`unknown preparation field: ${key}`)
      return field.local === key ? '' : `const ${key} = ${field.local}`
    })
    .join('\n')
}

function settingIsWritten(node) {
  let target = node
  while (
    ts.isArrayLiteralExpression(target.parent) ||
    ts.isObjectLiteralExpression(target.parent) ||
    ts.isSpreadElement(target.parent) ||
    (ts.isPropertyAssignment(target.parent) && target.parent.initializer === target)
  )
    target = target.parent
  return directWrite(target)
}

export function scalarPreparation(text, fields) {
  const prefix = 'function preparation() {'
  const file = ts.createSourceFile(
    'prepare.ts',
    `${prefix}${text}\n}`,
    ts.ScriptTarget.Latest,
    true,
  )
  if (file.parseDiagnostics.length) throw new Error('cannot parse inlined preparation')
  const edits = []
  function visit(node) {
    if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations[0]
      if (
        ts.isObjectBindingPattern(declaration.name) &&
        declaration.initializer?.getText(file) === 'ctx'
      ) {
        edits.push([node.getStart(file), node.end, destructuredState(node, fields, file)])
        return
      }
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'ctx'
    ) {
      const field = fields.get(node.name.text)
      if (!field) throw new Error(`unknown preparation field: ${node.name.text}`)
      if (!field.mutable && settingIsWritten(node))
        throw new Error('preparation setting is assigned')
      edits.push([node.getStart(file), node.end, field.local])
      return
    }
    if (ts.isIdentifier(node) && node.text === 'ctx') throw new Error('preparation state escapes')
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(file.statements[0].body, visit)
  for (const [start, end, replacement] of edits.reverse())
    text = text.slice(0, start - prefix.length) + replacement + text.slice(end - prefix.length)
  const result = ts.createSourceFile(
    'prepare.ts',
    `${prefix}${text}\n}`,
    ts.ScriptTarget.Latest,
    true,
  )
  ts.bindSourceFile(result, {})
  if (result.parseDiagnostics.length || result.bindDiagnostics.length)
    throw new Error('inlined preparation has conflicting bindings')
  return text
}
