// Inline the split walker for the shipped engine so its hot scan keeps local values.
import ts from 'typescript'
import {
  moduleFunctions,
  parts,
  replaceOnce,
  replacePattern,
  rewriteReturns,
  objectParts,
  directWrite,
} from './inline-walker-ast.mjs'
import { verifyHelpers } from './inline-walker-contract.mjs'
import { inlineWalkerOutput } from './inline-walker-output.mjs'

function addNames(properties, names) {
  for (const property of properties) {
    if (!ts.isShorthandPropertyAssignment(property)) throw new Error('walker profile field changed')
    if (names.has(property.name.text))
      throw new Error(`duplicate walker field: ${property.name.text}`)
    names.add(property.name.text)
  }
}

function addInitialState(functions, name, mutable, names) {
  const initial = objectParts(functions, name)
  if (initial.before.trim()) throw new Error(`walker initializer has statements: ${name}`)
  for (const property of initial.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name))
      throw new Error(`walker initializer changed: ${name}`)
    const key = property.name.text
    if (names.has(key) || mutable.has(key)) throw new Error(`duplicate walker field: ${key}`)
    let value = property.initializer
    if (ts.isAsExpression(value)) value = value.expression
    if (
      !ts.isNumericLiteral(value) &&
      ![ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
        value.kind,
      )
    )
      throw new Error(`walker initializer is not a literal: ${key}`)
    mutable.set(key, property.initializer.getText(initial.file))
  }
}

function walkerSetup(functions) {
  const state = objectParts(functions, 'makeWalkState')
  const profile = objectParts(functions, 'getWalkProfile')
  const names = new Set(),
    mutable = new Map()
  for (const property of state.properties) {
    if (ts.isShorthandPropertyAssignment(property)) addNames([property], names)
    else if (
      ts.isSpreadAssignment(property) &&
      property.expression.getText(state.file) === 'profile'
    )
      addNames(profile.properties, names)
    else if (ts.isSpreadAssignment(property) && ts.isCallExpression(property.expression)) {
      const call = property.expression
      if (!ts.isIdentifier(call.expression) || call.arguments.length)
        throw new Error('walker state spread changed')
      if (!['initialLineState', 'initialSegmentState'].includes(call.expression.text))
        throw new Error(`unexpected walker state spread: ${call.expression.text}`)
      addInitialState(functions, call.expression.text, mutable, names)
    } else throw new Error('walker state field changed')
  }
  const anchor =
    'const profile = getWalkProfile(prepared, items, maxWidth, discretionaryHyphenWidth)'
  let setup = replaceOnce(state.before, anchor, profile.before)
  for (const [name, initializer] of mutable) setup += `\n  let __walk_${name} = ${initializer}`
  return { setup, names, mutable }
}

function inlineFollowing(functions) {
  let overflow = parts(functions, 'segmentOverflows').text
  overflow = rewriteReturns(overflow, { overflows: '' })
  const retreat = rewriteReturns(parts(functions, 'retreatBeforeHardBreak').text, {
    '-1': 'break decided',
    '-2': 'continue scanLoop',
    0: '',
  })
  const hanging = rewriteReturns(parts(functions, 'finishHangingOverflow').text, {
    true: 'break decided',
    false: '',
  })
  const fitting = rewriteReturns(parts(functions, 'recordFittingSegment').text, {
    '-2': 'continue scanLoop',
  })
  let following = parts(functions, 'admitFollowingSegment').text
  following = replaceOnce(
    following,
    'const overflows = segmentOverflows(state, i, newFitW)',
    overflow,
  )
  following = replaceOnce(following, 'if (finishHangingOverflow(state, i)) return -1', hanging)
  following = replacePattern(
    following,
    /const hardBreak = retreatBeforeHardBreak\(state, i\)\s*if \(hardBreak !== 0\) return hardBreak/g,
    retreat,
  )
  following = replaceOnce(following, 'return recordFittingSegment(state, i, newFitW)', fitting)
  return rewriteReturns(following, { '-1': 'break decided', '-2': 'continue scanLoop', 0: '' })
}

function inlineScan(functions) {
  const first = rewriteReturns(parts(functions, 'admitFirstSegment').text, {
    true: 'continue scanLoop',
    false: '',
  })
  const init = rewriteReturns(parts(functions, 'initializeComplexSegment').text, {
    true: '{ consumedEndSegmentIndex = i + 1; break scanLoop }',
    false: '',
  })
  let scan = parts(functions, 'scanComplexSegment').text
  scan = replaceOnce(
    scan,
    'if (i >= state.segmentCount) return state.segmentCount',
    'if (i >= state.segmentCount) { consumedEndSegmentIndex = state.segmentCount; break scanLoop }',
  )
  scan = replaceOnce(scan, 'if (initializeComplexSegment(state, i)) return i + 1', init)
  scan = replaceOnce(scan, 'recordSoftHyphen(state, i)', parts(functions, 'recordSoftHyphen').text)
  scan = replaceOnce(
    scan,
    'measureComplexFit(state, i)',
    parts(functions, 'measureComplexFit').text,
  )
  scan = replaceOnce(scan, 'if (admitFirstSegment(state, i)) return -2', first)
  scan = replacePattern(
    scan,
    /const result = admitFollowingSegment\(state, i\)\s*if \(result !== 0\) return result/g,
    inlineFollowing(functions),
  )
  return rewriteReturns(scan, { '-1': 'break decided', '-2': 'continue scanLoop' })
}

function inlineLines(functions) {
  const loop =
    /for \(let i = state\.lineStartSegmentIndex; ; i\+\+\) \{\s*const result = scanComplexSegment\(state, i\)\s*if \(result === -1\) break decided\s*if \(result >= 0\) \{\s*consumedEndSegmentIndex = result\s*break\s*\}\s*\}/g
  let decide = parts(functions, 'decideComplexLine').text
  decide = replacePattern(
    decide,
    loop,
    `scanLoop: for (let i = state.lineStartSegmentIndex; ; i++) {${inlineScan(functions)}\n}`,
  )
  let line = parts(functions, 'walkComplexLine').text
  line = replaceOnce(line, 'decideComplexLine(state)', decide)
  line = replaceOnce(line, 'finishComplexLine(state)', parts(functions, 'finishComplexLine').text)
  return replaceOnce(line, 'return state.lineWidth', 'const lineWidth = state.lineWidth')
}

function scalarWalker(text, names, mutable, helpers) {
  const prefix = 'function walker() {'
  const file = ts.createSourceFile('walker.ts', `${prefix}${text}\n}`, ts.ScriptTarget.Latest, true)
  if (file.parseDiagnostics.length) throw new Error('cannot parse inlined walker')
  ts.bindSourceFile(file, {})
  if (file.bindDiagnostics.length) throw new Error('inlined walker has conflicting bindings')
  const edits = []
  function visit(node) {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'state'
    ) {
      const key = node.name.text
      if (!names.has(key) && !mutable.has(key)) throw new Error(`unknown walker field: ${key}`)
      if (names.has(key) && directWrite(node)) throw new Error(`walker setting is assigned: ${key}`)
      edits.push([
        node.getStart(file) - prefix.length,
        node.end - prefix.length,
        mutable.has(key) ? `__walk_${key}` : key,
      ])
      return
    }
    if (ts.isIdentifier(node) && node.text === 'state') throw new Error('walker state escapes')
    if (ts.isIdentifier(node) && helpers.has(node.text))
      throw new Error(`walker helper was not inlined: ${node.text}`)
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(file.statements[0].body, visit)
  for (const [start, end, replacement] of edits.reverse())
    text = text.slice(0, start) + replacement + text.slice(end)
  return text
}

/** Inline the canonical walker helpers before specializing and packing the engine. */
export function inlineWalker(source, stateSource) {
  if (source.includes('__walk_') || stateSource.includes('__walk_'))
    throw new Error('walker uses the inliner prefix')
  const functions = moduleFunctions('line-break-complex.ts', source)
  const stateFunctions = moduleFunctions('line-break-complex-state.ts', stateSource)
  verifyHelpers(functions, stateFunctions)
  const { setup, names, mutable } = walkerSetup(stateFunctions)
  const walker = parts(functions, 'walkPreparedComplexLines')
  let text = replaceOnce(
    walker.text,
    'const state = makeWalkState(prepared, cursor, maxWidth)',
    setup,
  )
  text = replaceOnce(text, 'const lineWidth = walkComplexLine(state)', inlineLines(functions))
  const helpers = new Set(functions.keys())
  for (const name of ['getTerminalLetterSpacing', 'staysAfterObject', 'returnsFromUnfitHyphen'])
    helpers.delete(name)
  text = scalarWalker(text, names, mutable, helpers)
  return inlineWalkerOutput(source, functions, walker, text)
}
