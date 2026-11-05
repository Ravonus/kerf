// Derive the shipped measurement loop from its authored helpers, without a per-segment state object.
import ts from 'typescript'
import { moduleFunctions, parts, replaceOnce } from './inline-walker-ast.mjs'
import {
  verifyPreparation,
  verifyPreparationCaptures,
  verifySpacingScope,
} from './inline-prepare-contract.mjs'
import { preparationState, scalarPreparation } from './inline-prepare-state.mjs'
import { scopePreparationSegments } from './inline-prepare-segment.mjs'
import {
  preparationFinish,
  preparationOutput,
  finishPreparationBody,
} from './inline-prepare-output.mjs'

function inlineSegments(functions) {
  let text = parts(functions, 'measureSegments').text
  text = inlineSpacing(text, functions)
  for (const name of ['storeHyphenContext', 'measureControl', 'adjustAdvances']) {
    const helper = parts(functions, name)
    const parameters = helper.node.parameters.map((p) => p.name.getText(helper.file)).join(', ')
    const call = `${name}(${parameters})`
    text =
      name === 'measureControl'
        ? replaceOnce(text, `${call}\n        break`, `{${helper.text}\n break\n}`)
        : replaceOnce(text, call, `{${helper.text}\n}`)
  }
  const kerning = parts(functions, 'textKerning')
  const body = replaceOnce(kerning.text, 'return followingSpaceKerning', '')
  text = replaceOnce(
    text,
    'followingSpaceKerning = textKerning(ctx, mi, at, text, textMetrics, followingSpaceKerning)',
    `{${body}\n}`,
  )
  const fit = parts(functions, 'textFitMode')
  if (fit.node.body.statements.length !== 1) throw new Error('preparation fit helper changed')
  return replaceOnce(
    text,
    'textFitMode(text, textMetrics, letterSpacing, engineProfile)',
    `(${fit.node.body.statements[0].expression.getText(fit.file)})`,
  )
}

function inlineSpacing(text, functions) {
  verifySpacingScope(functions)
  let body = parts(functions, 'textSpacing').text
  body = replaceOnce(body, 'ctx.unspaced = null', '')
  body = replaceOnce(body, 'ctx.extraSpacings = noExtraSpacings', '')
  body = body.replace(/\bctx\.(unspaced|extraSpacings)\b/g, '$1')
  text = replaceOnce(text, 'textSpacing(ctx, mi, kind, text, textMetrics)', `{${body}\n}`)
  text = replaceOnce(text, 'unspaced = ctx.unspaced as number[] | null', '')
  return replaceOnce(text, 'extraSpacings = ctx.extraSpacings', '')
}

function inlineFinish(prepare, finish, fields) {
  const call = prepare.node.body.statements.at(-1).expression
  if (
    call.expression?.getText(prepare.file) !== 'finishMeasurement' ||
    call.arguments?.length !== finish.node.parameters.length
  )
    throw new Error('preparation finish call changed')
  finish.node.parameters.forEach((parameter, i) => {
    const name = parameter.name.getText(finish.file)
    if (call.arguments[i].getText(prepare.file) !== `ctx.${name}`)
      throw new Error('preparation finish argument changed')
    const field = fields.get(name)
    if (!field) throw new Error(`unknown preparation finish field: ${name}`)
  })
  return finishPreparationBody(finish, fields)
}

function verifyInlined(text, functions) {
  const file = ts.createSourceFile('prepare.ts', text, ts.ScriptTarget.Latest, true)
  function visit(node) {
    if (ts.isIdentifier(node) && functions.has(node.text))
      throw new Error(`preparation helper was not inlined: ${node.text}`)
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(file, visit)
}

/** Inline the canonical preparation helpers before specializing and packing the engine. */
export function inlinePreparation(source, measure, finishSource) {
  if ([source, measure, finishSource].some((text) => text.includes('__prepare_')))
    throw new Error('preparation uses the inliner prefix')
  const functions = moduleFunctions('prepare-measure.ts', measure)
  const prepare = parts(moduleFunctions('prepare.ts', source), 'measureAnalysis')
  const finish = preparationFinish(finishSource)
  verifyPreparation(functions, prepare, finish)
  const { setup, fields } = preparationState(functions)
  verifyPreparationCaptures(functions, fields, finish)
  const create = parts(functions, 'createMeasurement')
  const parameters = create.node.parameters.map((p) => p.name.getText(create.file)).join(', ')
  let text = replaceOnce(prepare.text, `const ctx = createMeasurement(${parameters})`, setup)
  text = replaceOnce(text, 'measureSegments(ctx)', `{${inlineSegments(functions)}\n}`)
  const last = prepare.node.body.statements.at(-1)
  text = replaceOnce(text, last.getText(prepare.file), inlineFinish(prepare, finish, fields))
  text = scalarPreparation(text, fields)
  text = scopePreparationSegments(text, fields)
  verifyInlined(text, functions)
  return preparationOutput(prepare, measure, finishSource, text)
}
