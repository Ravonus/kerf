// Derive the scan's small fallback from its split helper without adding a call per boundary.
import ts from 'typescript'
import { moduleFunctions, parts, replaceOnce } from './inline-walker-ast.mjs'
import { verifyPreparationHelper } from './inline-prepare-contract.mjs'

/** Inline the canonical rule fallback into its sole, unchanged call site. */
export function inlineBoundaries(source) {
  const functions = moduleFunctions('line-breaks.ts', source)
  const helper = parts(functions, 'ruleBoundary')
  verifyPreparationHelper(helper, 'boundary, result, start, text, length', 'boundary', ['boundary'])
  if (helper.node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    throw new Error('boundary helper is exported')
  const body = source.slice(
    helper.node.body.getStart(helper.file) + 1,
    helper.node.body.statements.at(-1).getStart(helper.file),
  )
  source = replaceOnce(
    source,
    'boundary = ruleBoundary(boundary, result, start, text, length)',
    `{${body}\n}`,
  )
  source = source.slice(0, helper.node.getStart(helper.file)) + source.slice(helper.node.end)
  const file = ts.createSourceFile('line-breaks.ts', source, ts.ScriptTarget.Latest, true)
  ts.bindSourceFile(file, {})
  if (file.parseDiagnostics.length || file.bindDiagnostics.length)
    throw new Error('inlined boundary has conflicting bindings')
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === 'ruleBoundary')
      throw new Error('boundary helper was not inlined')
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(file, visit)
  return source
}
