// Accept only the synchronous helper scopes that the preparation inliner preserves.
import ts from 'typescript'
import { directWrite, parts } from './inline-walker-ast.mjs'

export function verifyPreparationHelper(item, parameters, returned, mutable = []) {
  const { node, file } = item
  ts.bindSourceFile(file, {})
  if (file.bindDiagnostics.length) throw new Error('preparation source has conflicting bindings')
  const names = node.parameters.map((p) => p.name.getText(file))
  if (names.join(', ') !== parameters) throw new Error('preparation parameters changed')
  if (
    node.asteriskToken ||
    node.typeParameters?.length ||
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ||
    node.parameters.some((p) => p.initializer || p.dotDotDotToken || p.questionToken)
  )
    throw new Error('preparation helper binding changed')
  const bindings = new Set(names.filter((name) => !mutable.includes(name)))
  const returns = []
  function visit(child) {
    if (
      ts.isFunctionLike(child) ||
      child.kind === ts.SyntaxKind.ThisKeyword ||
      child.kind === ts.SyntaxKind.SuperKeyword ||
      ts.isMetaProperty(child) ||
      (ts.isIdentifier(child) && child.text === 'arguments')
    )
      throw new Error('preparation helper scope changed')
    if (ts.isIdentifier(child) && bindings.has(child.text)) {
      let target = child
      while (
        ts.isArrayLiteralExpression(target.parent) ||
        ts.isObjectLiteralExpression(target.parent) ||
        ts.isSpreadElement(target.parent) ||
        ts.isShorthandPropertyAssignment(target.parent) ||
        (ts.isPropertyAssignment(target.parent) && target.parent.initializer === target)
      )
        target = target.parent
      if (directWrite(target)) throw new Error('preparation parameter is assigned')
    }
    if (ts.isReturnStatement(child)) returns.push(child)
    ts.forEachChild(child, visit)
  }
  ts.forEachChild(node.body, visit)
  if (returns.length !== (returned === null ? 0 : 1))
    throw new Error('preparation helper returns changed')
  if (returned !== null && returns[0] !== node.body.statements.at(-1))
    throw new Error('preparation helper returns early')
  if (typeof returned === 'string' && returns[0].expression?.getText(file) !== returned)
    throw new Error('preparation helper return changed')
}

export function verifyPreparation(functions, prepare, finish) {
  for (const statement of parts(functions, 'createMeasurement').file.statements)
    if (
      !ts.isImportDeclaration(statement) &&
      !ts.isFunctionDeclaration(statement) &&
      !ts.isTypeAliasDeclaration(statement)
    )
      throw new Error('preparation measurement module has an unexpected declaration')
  for (const statement of finish.file.statements)
    if (
      !ts.isImportDeclaration(statement) &&
      !ts.isFunctionDeclaration(statement) &&
      !(
        ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.length === 1 &&
        statement.declarationList.declarations[0].initializer === finish.node
      )
    )
      throw new Error('preparation finish module has an unexpected declaration')
  const argumentsList =
    'analysis, from, to, font, includeSegments, letterSpacing, engineProfile, language, overflowBreaks, paragraph'
  verifyPreparationHelper(parts(functions, 'createMeasurement'), argumentsList, true)
  verifyPreparationHelper(prepare, argumentsList, true)
  for (const [name, parameters] of [
    ['measureSegments', 'ctx'],
    ['measureControl', 'ctx, mi, text'],
    ['textSpacing', 'ctx, mi, kind, text, textMetrics'],
    ['adjustAdvances', 'ctx, followingSpaceKerning, extraSpacings, unspaced, letterSpacing'],
    ['storeHyphenContext', 'ctx, mi, kind, text'],
  ])
    verifyPreparationHelper(parts(functions, name), parameters, null)
  verifyPreparationHelper(
    parts(functions, 'textKerning'),
    'ctx, mi, at, text, textMetrics, followingSpaceKerning',
    'followingSpaceKerning',
    ['followingSpaceKerning'],
  )
  verifyPreparationHelper(
    parts(functions, 'textFitMode'),
    'text, textMetrics, letterSpacing, engineProfile',
    true,
  )
  verifyPreparationHelper(
    finish,
    'analysis, from, to, own, fontMeasurement, engineProfile, letterSpacing, emojiCorrection, widths, base, segmentFlags, simpleKinds, breakableFitAdvances, breakableLineStartExtras, discretionaryHyphenContexts, tabStopAdvance, minimumTabAdvance, segments',
    'prepared',
  )
}

export function verifyPreparationCaptures(functions, fields, finish) {
  const direct = new Set(fields.keys())
  function verify(item, bindings) {
    function visit(node) {
      if (ts.isVariableDeclaration(node)) {
        if (ts.isObjectBindingPattern(node.name) && node.initializer?.getText(item.file) === 'ctx')
          return
        function binding(child) {
          if (ts.isIdentifier(child) && bindings.has(child.text))
            throw new Error(`preparation local captures an inlined binding: ${child.text}`)
          ts.forEachChild(child, binding)
        }
        binding(node.name)
      }
      ts.forEachChild(node, visit)
    }
    ts.forEachChild(item.node.body, visit)
  }
  for (const name of functions.keys())
    if (name !== 'createMeasurement') verify(parts(functions, name), direct)
  verify(
    finish,
    new Set(finish.node.parameters.map((parameter) => parameter.name.getText(finish.file))),
  )
}

export function verifySpacingScope(functions) {
  const spacing = parts(functions, 'textSpacing')
  const resets = spacing.node.body.statements.slice(1, 3).map((node) => node.getText(spacing.file))
  if (resets.join('\n') !== 'ctx.unspaced = null\nctx.extraSpacings = noExtraSpacings')
    throw new Error('preparation spacing resets changed')
  const measure = parts(functions, 'measureSegments'),
    calls = []
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(measure.file) === 'textSpacing')
      calls.push(node)
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(measure.node.body, visit)
  const block = calls[0]?.parent.parent
  if (
    calls.length !== 1 ||
    !block ||
    !ts.isBlock(block) ||
    block.statements.length !== 3 ||
    block.statements[0] !== calls[0].parent ||
    !ts.isIfStatement(block.parent) ||
    block.parent.expression.getText(measure.file) !== 'hasLetterSpacing'
  )
    throw new Error('preparation spacing call scope changed')
  const outer = block.parent.parent.statements
  const at = outer.indexOf(block.parent)
  const defaults = outer.slice(at - 2, at).map((node) => node.getText(measure.file))
  if (
    defaults.join('\n') !==
    'let unspaced: number[] | null = null\nlet extraSpacings = noExtraSpacings'
  )
    throw new Error('preparation spacing defaults changed')
}
