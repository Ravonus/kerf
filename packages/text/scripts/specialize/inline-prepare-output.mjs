// Keep one preparation entry and the original live imports after inlining its private helpers.
import ts from 'typescript'
import { moduleFunctions, parts, replaceOnce } from './inline-walker-ast.mjs'

export function preparationFinish(source) {
  const item = parts(moduleFunctions('prepare-finish.ts', source), 'finishMeasurement')
  if (!ts.isArrowFunction(item.node)) throw new Error('preparation finish is not a block arrow')
  return item
}

export function finishPreparationBody(finish, fields) {
  const { node, file } = finish
  const parameters = new Set(node.parameters.map((parameter) => parameter.name.getText(file)))
  const edits = []
  function visit(child) {
    if (ts.isIdentifier(child) && parameters.has(child.text)) {
      const parent = child.parent
      if (
        (ts.isPropertyAccessExpression(parent) && parent.name === child) ||
        (ts.isPropertyAssignment(parent) && parent.name === child)
      )
        return
      const local = fields.get(child.text).local
      if (local !== child.text)
        edits.push([
          child.getStart(file),
          child.end,
          ts.isShorthandPropertyAssignment(parent) ? `${child.text}: ${local}` : local,
        ])
    }
    ts.forEachChild(child, visit)
  }
  ts.forEachChild(node.body, visit)
  let text = finish.text
  const offset = node.body.getStart(file) + 1
  for (const [start, end, replacement] of edits.reverse())
    text = text.slice(0, start - offset) + replacement + text.slice(end - offset)
  return text
}

function preparationImports(sources) {
  const bindings = new Map()
  for (const source of sources) {
    const file = ts.createSourceFile('imports.ts', source, ts.ScriptTarget.Latest, true)
    for (const node of file.statements.filter(ts.isImportDeclaration)) {
      const specifier = node.moduleSpecifier.text
      if (['./prepare.js', './prepare-measure.js', './prepare-finish.js'].includes(specifier))
        continue
      const clause = node.importClause
      if (!clause || clause.name || !ts.isNamedImports(clause.namedBindings))
        throw new Error('preparation import shape changed')
      for (const element of clause.namedBindings.elements) {
        const name = element.name.text,
          imported = (element.propertyName ?? element.name).text,
          type = clause.isTypeOnly || element.isTypeOnly,
          previous = bindings.get(name)
        if (previous && (previous.specifier !== specifier || previous.imported !== imported))
          throw new Error(`conflicting preparation import: ${name}`)
        bindings.set(name, { specifier, imported, type: type && previous?.type !== false })
      }
    }
  }
  return [...bindings].map(([name, { specifier, imported, type }]) => {
    const binding = imported === name ? name : `${imported} as ${name}`
    return `import ${type ? 'type ' : ''}{ ${binding} } from '${specifier}'`
  })
}

export function preparationOutput(prepare, measure, finish, text) {
  const { node, file, source } = prepare
  let output =
    source.slice(0, node.body.getStart(file) + 1) + text + source.slice(node.body.end - 1)
  for (const declaration of [...file.statements.filter(ts.isImportDeclaration)].reverse())
    output = output.slice(0, declaration.getStart(file)) + output.slice(declaration.end)
  const imports = preparationImports([measure, finish, source])
  imports.push("import { addKanaKerning, addIdeographicSpaceHangs } from './prepare-finish.js'")
  return imports.join('\n') + '\n' + output
}

export function exportPreparationFinish(source) {
  for (const name of ['addKanaKerning', 'addIdeographicSpaceHangs'])
    source = replaceOnce(source, `function ${name}(`, `export function ${name}(`)
  return source
}
