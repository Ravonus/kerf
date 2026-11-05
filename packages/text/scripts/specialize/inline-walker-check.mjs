// Exercise the generated walker's source contract and reject changed helper shapes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inlineWalker } from './inline-walker.mjs'
import { moveFunctions } from './move.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const vendor = path.join(root, 'vendor/pretext/src')
const source = fs.readFileSync(path.join(vendor, 'line-break-complex.ts'), 'utf8')
const state = fs.readFileSync(path.join(vendor, 'line-break-complex-state.ts'), 'utf8')
const generated = inlineWalker(source, state)
assert.doesNotMatch(generated, /function recordSoftHyphen\(/)
assert.match(generated, /function staysAfterObject\(/)
const helperEdit = 'state.pendingBreakWidth = state.lineW + hyphenWidth'
assert.ok(source.includes(helperEdit))
const changed = inlineWalker(source.replace(helperEdit, `${helperEdit} + 1`), state)
const walker = changed.slice(changed.indexOf('export function walkPreparedComplexLines('))
assert.ok(walker.includes('pendingBreakWidth = __walk_lineW + hyphenWidth + 1'))
assert.notEqual(changed, generated)
const stub = moveFunctions(
  'probe.ts',
  'function probe(singleLine: boolean = false): boolean { return singleLine }',
  { probe: 'complex' },
).base
assert.match(stub, /function probe\(singleLine: boolean = false\)/)

const defects = [
  [source.replace('function finishHangingOverflow(', 'function missingOverflow('), state],
  [
    source.replace(
      'function recordSoftHyphen(state: ComplexWalkState, i: number): void {',
      'function recordSoftHyphen(state: ComplexWalkState, i: number): void {\n  const escaped = state',
    ),
    state,
  ],
  [
    source.replace(
      'function retreatBeforeHardBreak(state: ComplexWalkState, i: number): number {',
      'function retreatBeforeHardBreak(state: ComplexWalkState, i: number): number {\n  return 0',
    ),
    state,
  ],
  [
    source.replace(
      'function recordSoftHyphen(state: ComplexWalkState, i: number): void {',
      'function recordSoftHyphen(state: ComplexWalkState, i: number): void {\n  state.availableWidth = 0',
    ),
    state,
  ],
  [
    source.replace(
      'function recordSoftHyphen(state: ComplexWalkState, i: number): void {',
      'function recordSoftHyphen(state: ComplexWalkState, i: number): void {\n  i++',
    ),
    state,
  ],
  [
    source.replace(
      'function recordSoftHyphen(state: ComplexWalkState, i: number): void {',
      'function recordSoftHyphen(state: ComplexWalkState, i: number): void {\n  [i] = [0]',
    ),
    state,
  ],
  [
    source.replace(
      'function recordSoftHyphen(state: ComplexWalkState, i: number): void {',
      'function recordSoftHyphen(state: ComplexWalkState, i: number): void {\n  const read = () => state.lineW',
    ),
    state,
  ],
  [source, state.replace('lineW: 0,', 'lineW: Number(0),')],
  [
    source.replace(
      'function walkComplexLine(state: ComplexWalkState): number | null {',
      'function walkComplexLine(state: ComplexWalkState): number | null {\n  let lineWidth = 0',
    ),
    state,
  ],
]
for (const [brokenSource, brokenState] of defects) {
  assert.ok(brokenSource !== source || brokenState !== state)
  assert.throws(() => inlineWalker(brokenSource, brokenState))
}
console.log(`Walker inliner uses the helper edit and rejects ${defects.length} planted defects.`)
