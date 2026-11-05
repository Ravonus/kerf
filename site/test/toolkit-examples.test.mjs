import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { readExamples, showExample } from '../scripts/toolkit.mjs'

const ts = createRequire(new URL('../../packages/cli/package.json', import.meta.url))('typescript')

await test('canvas reexports keep every demo and paste self-contained code', () => {
  const path = 'site/src/toolkit/examples/canvas.tsx'
  const names = [
    'CanvasBars',
    'CanvasWave',
    'CanvasPointer',
    'CanvasCells',
    'CanvasTrail',
    'CanvasRipples',
    'CanvasLive',
    'CanvasThemed',
    'CanvasOrbits',
    'CanvasNeedle',
    'CanvasNight',
    'CanvasLife',
    'DitherFieldPlay',
    'DitherFieldKinds',
    'DitherFieldRamps',
    'DitherFieldPointer',
    'DitherFieldHero',
    'DitherFieldStill',
    'DitherPlay',
    'DitherImage',
    'DitherGradient',
    'DitherRadial',
    'DitherAlgorithms',
    'DitherBanner',
    'DitherGlyphPlay',
    'DitherGlyphWord',
    'DitherGlyphLogo',
    'DitherGlyphDrawn',
    'DitherGlyphReveal',
    'CanvasStagePlain',
    'CanvasStageFlat',
    'StageSelectDither',
    'StageSelectFlat',
    'StageSelectSketch',
    'CanvasStageSketch',
    'CanvasStageNeon',
    'StageSkins',
    'StageHybrid',
    'StageOwnSkin',
    'StageModal',
    'StageLanding',
  ]
  const examples = readExamples(path)
  assert.deepEqual([...examples.keys()], names)
  assert.equal(names.length, 41)
  for (const [name, example] of examples) {
    const text = showExample(example, name)
    assert.doesNotMatch(text, /from ['"]\./, name)
    const sf = ts.createSourceFile(
      `${name}.tsx`,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    assert.equal(sf.parseDiagnostics.length, 0, name)
  }
})

await test('reexported examples follow local dependencies and reject missing or invalid helpers', () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-toolkit-'))
  try {
    mkdirSync(join(root, 'canvas'))
    const entry = join(root, 'canvas.tsx')
    const demo = join(root, 'canvas', 'demo.tsx')
    const helper = join(root, 'canvas', 'helper.tsx')
    writeFileSync(entry, "export { Demo } from './canvas/demo'\n")
    writeFileSync(
      demo,
      "import { chosen } from './helper'\nexport const Demo = () => <p>{chosen()}</p>\n",
    )
    writeFileSync(
      helper,
      'const deep = () => 7\nexport const chosen = () => deep()\nexport const unrelated = () => 9\n',
    )
    const text = showExample(readExamples(entry).get('Demo'), 'Demo')
    assert.match(text, /const chosen/)
    assert.match(text, /const deep/)
    assert.doesNotMatch(text, /unrelated|from ['"]\./)
    writeFileSync(helper, 'export const unrelated = () => 9\n')
    assert.throws(() => readExamples(entry), /Missing chosen/)
    writeFileSync(helper, 'export const chosen = (\n')
    assert.throws(() => readExamples(entry), /Invalid/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
