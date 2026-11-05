// Keep the split Gecko analysis helpers from allocating a tuple in the shipped preparation path.
import ts from 'typescript'
import { moduleFunctions, parts, replaceOnce } from './inline-walker-ast.mjs'
import { verifyPreparationHelper } from './inline-prepare-contract.mjs'

function analysisHelper(functions, name) {
  const item = parts(functions, name)
  const { statement, node } = item
  if (
    !ts.isArrowFunction(node) ||
    !ts.isVariableStatement(statement) ||
    statement.declarationList.declarations.length !== 1 ||
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  )
    throw new Error(`analysis helper shape changed: ${name}`)
  return item
}

/** Inline only the authored analysis helpers whose calls and scopes are checked here. */
export function inlineAnalysis(source) {
  const functions = moduleFunctions('analysis.ts', source)
  const trim = analysisHelper(functions, 'trimGeckoSource')
  const clear = analysisHelper(functions, 'clearAtomicBreaks')
  const { file } = trim
  verifyPreparationHelper(
    trim,
    'source, normalized, sourceBreaks, leftOut, preserve, dropsBidiControl, profile',
    '[source, normalized]',
    ['source', 'normalized'],
  )
  verifyPreparationHelper(clear, 'source, sourceBreaks, paragraph, scanStarts', null)
  const trimBody = source.slice(
    trim.node.body.getStart(file) + 1,
    trim.node.body.statements.at(-1).getStart(file),
  )
  const clearBody = source.slice(clear.node.body.getStart(file) + 1, clear.node.body.end - 1)
  source = replaceOnce(
    source,
    ';[source, normalized] = trimGeckoSource(source, normalized, sourceBreaks, gecko.leftOut, preserve, dropsBidiControl, profile)',
    `{ const leftOut = gecko.leftOut\n${trimBody}\n}`,
  )
  source = replaceOnce(
    source,
    'clearAtomicBreaks(source, sourceBreaks, paragraph, scanStarts)',
    `{${clearBody}\n}`,
  )
  for (const helper of [clear, trim])
    source = source.slice(0, helper.statement.getStart(file)) + source.slice(helper.statement.end)
  const output = ts.createSourceFile('analysis.ts', source, ts.ScriptTarget.Latest, true)
  ts.bindSourceFile(output, {})
  if (output.parseDiagnostics.length || output.bindDiagnostics.length)
    throw new Error('inlined analysis has conflicting bindings')
  function visit(node) {
    if (ts.isIdentifier(node) && ['clearAtomicBreaks', 'trimGeckoSource'].includes(node.text))
      throw new Error('analysis helper was not inlined')
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(output, visit)
  return source
}

/** Keep the split flag scan in its caller with the caller's segment count. */
export function inlineAnalysisSegments(source) {
  if (source.includes('__analysis_')) throw new Error('analysis uses the inliner prefix')
  const functions = moduleFunctions('analysis-segments.ts', source)
  const helper = analysisHelper(functions, 'flagUnbroken')
  verifyPreparationHelper(helper, 'flags, starts, breaks, hangTabs, count', 'hasUnbroken')
  const caller = parts(functions, 'segmentAtLineBreaks')
  rejectSegmentCapture(helper, caller)
  const offset = helper.node.body.getStart(helper.file) + 1
  const body = source.slice(offset, helper.node.body.statements.at(-1).getStart(helper.file))
  source = replaceOnce(
    source,
    'const hasUnbroken = flagUnbroken(flags, starts, breaks, hangTabs, count)',
    body,
  )
  source =
    source.slice(0, helper.statement.getStart(helper.file)) + source.slice(helper.statement.end)
  const file = ts.createSourceFile('analysis-segments.ts', source, ts.ScriptTarget.Latest, true)
  ts.bindSourceFile(file, {})
  if (file.parseDiagnostics.length || file.bindDiagnostics.length)
    throw new Error('inlined segment analysis has conflicting bindings')
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === 'flagUnbroken')
      throw new Error('segment helper was not inlined')
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(file, visit)
  return source
}

function rejectSegmentCapture(helper, caller) {
  function bindings(item) {
    const names = new Set(item.node.parameters.map((node) => node.name.getText(item.file)))
    function collect(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) names.add(node.name.text)
      ts.forEachChild(node, collect)
    }
    ts.forEachChild(item.node.body, collect)
    return names
  }
  const outside = bindings(caller),
    inside = bindings(helper)
  function visit(node) {
    if (ts.isIdentifier(node) && outside.has(node.text) && !inside.has(node.text))
      throw new Error(`segment helper captures a caller binding: ${node.text}`)
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(helper.node.body, visit)
}
