// Exercise the inlined fallback on UTF-16 progress and reject unsafe helper changes.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { inlineBoundaries } from './inline-boundaries.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const vendor = path.join(root, 'vendor/pretext/src')
const input = path.join(vendor, 'line-breaks.ts')
const tracked = execFileSync('git', ['ls-files', '--', input], { encoding: 'utf8' })
  .trim()
  .split('\n')
assert.equal(tracked.length, 1)
assert.equal(path.basename(tracked[0]), 'line-breaks.ts')
const source = fs.readFileSync(input, 'utf8')
const generated = inlineBoundaries(source)
assert.doesNotMatch(generated, /\bruleBoundary\b/)
const edited = inlineBoundaries(source.replace('boundary = start + 1', 'boundary = start + 2'))
assert.ok(edited.includes('boundary = start + 2'))
assert.notEqual(edited, generated)
const defects = [
  ['return boundary', 'return result'],
  ['return boundary', 'return boundary\n return boundary'],
  ['function ruleBoundary(', 'function missingBoundary('],
  ['function ruleBoundary(', 'export function ruleBoundary('],
  ['  if (boundary < 0)', '  start++\n if (boundary < 0)'],
  ['  if (boundary < 0)', '  void this\n if (boundary < 0)'],
  [
    'ruleBoundary(boundary, result, start, text, length)',
    'ruleBoundary(result, boundary, start, text, length)',
  ],
]
for (const [before, after] of defects) {
  assert.ok(source.includes(before))
  assert.throws(() => inlineBoundaries(source.replace(before, after)))
}

const result = await esbuild.build({
  stdin: {
    contents: "export { markRuleBoundaries } from './line-breaks.js'",
    resolveDir: vendor,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  plugins: [
    {
      name: 'derived-boundaries',
      setup(build) {
        build.onLoad({ filter: /\/line-breaks\.ts$/ }, () => ({
          contents: process.argv.includes('--probe') ? edited : generated,
          loader: 'ts',
        }))
      },
    },
  ],
})
const module = await import(
  'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
)
const rules = {
  rows: new Uint8Array(8),
  rowWidth: 4,
  dictCategoriesStart: 100,
  lookAheadResultsSize: 0,
  classes: { index: new Uint16Array(0x1100), values: new Uint8Array(256) },
}
for (const [text, expected] of [
  ['abc', [0, 1, 1, 1]],
  ['a🙂b', [0, 1, 0, 1, 1]],
  ['\ud800x\udc00', [0, 1, 1, 1]],
  ['', [0]],
]) {
  const flags = new Uint8Array(text.length + 1)
  module.markRuleBoundaries(rules, text, flags)
  assert.deepEqual([...flags], expected)
}
console.log(
  `Boundary inliner covers 1/1 Git input, preserves four UTF-16 fallbacks, uses the helper edit and rejects ${defects.length} defects.`,
)
