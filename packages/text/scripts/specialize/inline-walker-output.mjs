// Drop private helper declarations after their bodies have been inlined into the shipped walker.
import ts from 'typescript'

const retained = new Set([
  'getTerminalLetterSpacing',
  'staysAfterObject',
  'returnsFromUnfitHyphen',
  'walkPreparedComplexLines',
])

function checkRetained(functions, removed) {
  for (const name of retained) {
    if (name === 'walkPreparedComplexLines') continue
    const item = functions.get(name)
    if (!item) throw new Error(`walker retained helper missing: ${name}`)
    function visit(node) {
      if (ts.isIdentifier(node) && removed.has(node.text))
        throw new Error(`retained walker helper reads removed helper: ${node.text}`)
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(item.node.body, visit)
  }
}

/** Replace the walker body and remove only its now-inlined private helpers. */
export function inlineWalkerOutput(source, functions, walker, text) {
  const removed = new Set([...functions.keys()].filter((name) => !retained.has(name)))
  checkRetained(functions, removed)
  if (
    walker.file.statements.some(
      (statement) => !ts.isImportDeclaration(statement) && !ts.isFunctionDeclaration(statement),
    )
  )
    throw new Error('walker module has an unexpected declaration')
  const imports = walker.file.statements.filter(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier.text === './line-break-complex-state.js',
  )
  if (imports.length !== 1 || /\bgetEngineProfile\b/.test(source))
    throw new Error('walker imports changed')
  const edits = [
    [walker.node.body.getStart(walker.file) + 1, walker.node.body.end - 1, text],
    [
      imports[0].getStart(walker.file),
      imports[0].end,
      "import { getEngineProfile } from './measurement.js'",
    ],
  ]
  for (const name of removed) {
    const { node, file } = functions.get(name)
    if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
      throw new Error(`cannot remove exported walker helper: ${name}`)
    edits.push([node.getStart(file), node.end, ''])
  }
  edits.sort((a, b) => b[0] - a[0])
  for (const [start, end, replacement] of edits)
    source = source.slice(0, start) + replacement + source.slice(end)
  return source
}
