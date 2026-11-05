// Exercise the preparation transformation against its source, including observable reads and writes.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { inlinePreparation } from './inline-prepare.mjs'
import { exportPreparationFinish } from './inline-prepare-output.mjs'
import { inlineAnalysis } from './inline-analysis.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const vendor = path.join(root, 'vendor/pretext/src')
const names = ['prepare.ts', 'prepare-measure.ts', 'prepare-finish.ts']
const tracked = execFileSync(
  'git',
  ['ls-files', '--', ...names.map((name) => path.join(vendor, name))],
  {
    encoding: 'utf8',
  },
)
  .trim()
  .split('\n')
assert.equal(tracked.length, names.length)
assert.deepEqual(tracked.map((name) => path.basename(name)).sort(), [...names].sort())
const sources = names.map((name) => fs.readFileSync(path.join(vendor, name), 'utf8'))
const generated = inlinePreparation(...sources)
assert.doesNotMatch(generated, /\bctx\b|function createMeasurement\(|function measureSegments\(/)
const anchor = 'ctx.width = getTextWidth(text, fontMeasurement, emojiCorrection)'
assert.ok(sources[1].includes(anchor))
const edited = inlinePreparation(
  sources[0],
  sources[1].replace(anchor, `${anchor} + 1`),
  sources[2],
)
assert.match(edited, /width = getTextWidth\(text, fontMeasurement, emojiCorrection\) \+ 1/)
assert.notEqual(edited, generated)

function rejectChanges() {
  const [prepare, measure, finish] = sources
  const signature = 'function measureControl(ctx: MeasureState, mi: number, text: string): void {'
  const defects = [
    [prepare.replace('measureSegments(ctx)', 'measureSegments(other)'), measure, finish],
    [prepare.replace('ctx.widths,', 'ctx.segmentFlags,'), measure, finish],
    [prepare, measure.replace('function measureControl(', 'function missingControl('), finish],
    [prepare, measure.replace('width: 0,', 'width: Number(0),'), finish],
    [prepare, measure.replace('width: 0,', 'width: 0, width: 1,'), finish],
    [prepare, measure.replace(signature, `${signature}\n const escaped = ctx`), finish],
    [prepare, measure.replace(signature, `${signature}\n ctx.from = 0`), finish],
    [prepare, measure.replace(signature, `${signature}\n [ctx.from] = [0]`), finish],
    [prepare, measure.replace(signature, `${signature}\n mi++`), finish],
    [prepare, measure.replace(signature, `${signature}\n [mi] = [0]`), finish],
    [prepare, measure.replace(signature, `${signature}\n return`), finish],
    [prepare, measure.replace(signature, `${signature}\n const read = () => ctx.width`), finish],
    [
      prepare,
      measure.replace(signature, signature.replace('function ', 'async function ')),
      finish,
    ],
    [
      prepare,
      measure.replace(signature, signature.replace('mi: number', 'mi: number = 0')),
      finish,
    ],
    [prepare, measure.replace(signature, `${signature}\n void this`), finish],
    [prepare, measure.replace(signature, `${signature}\n void arguments`), finish],
    [prepare, measure.replace(signature, `${signature}\n ctx.unknown = 0`), finish],
    [prepare, measure.replace(signature, `${signature}\n let from = 0`), finish],
    [prepare, measure.replace(signature, `${signature}\n { const from = 0; void from }`), finish],
    [
      prepare.replace('measureSegments(ctx)', 'measureSegments(ctx)\n void ctx.width'),
      measure,
      finish,
    ],
    [prepare, measure.replace('ctx.width = 0', 'ctx.width = 1'), finish],
    [
      prepare,
      measure.replace('ctx.unspaced = null', 'void ctx.unspaced; ctx.unspaced = null'),
      finish,
    ],
    [
      prepare,
      measure.replace('let extraSpacings = noExtraSpacings', 'let extraSpacings = []'),
      finish,
    ],
    [
      prepare,
      measure,
      finish.replace('return prepared', '{ const from = 0; void from }\n return prepared'),
    ],
    [
      prepare,
      measure.replace('ctx.width = 0', 'ctx.width = measureControl(ctx, mi, text)'),
      finish,
    ],
    [prepare, measure + '\n// __prepare_reserved\n', finish],
    [prepare, measure, finish.replace('return prepared', 'return other')],
  ]
  for (const [index, broken] of defects.entries()) {
    assert.ok(broken.some((source, i) => source !== sources[i]))
    assert.throws(() => inlinePreparation(...broken), `defect ${index} was accepted`)
  }
  return defects.length
}

async function preparationModule(transformed, engine) {
  const result = await esbuild.build({
    stdin: {
      contents: `export { measureAnalysis } from './prepare.js'
export { analyzeText } from './analysis.js'
export { getEngineProfile, clearMeasurementCaches } from './measurement.js'`,
      resolveDir:
        transformed === 'pinned' ? path.join(root, 'node_modules/@chenglou/pretext/src') : vendor,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'derived-preparation',
        setup(build) {
          if (transformed !== true) return
          build.onLoad({ filter: /\/analysis\.ts$/ }, () => ({
            contents: inlineAnalysis(fs.readFileSync(path.join(vendor, 'analysis.ts'), 'utf8')),
            loader: 'ts',
          }))
          build.onLoad({ filter: /\/prepare\.ts$/ }, () => ({
            contents: process.argv.includes('--probe')
              ? generated.replace(
                  'return prepared',
                  'prepared.minimumTabAdvance += 1; return prepared',
                )
              : generated,
            loader: 'ts',
          }))
          build.onLoad({ filter: /\/prepare-finish\.ts$/ }, () => ({
            contents: exportPreparationFinish(sources[2]),
            loader: 'ts',
          }))
        },
      },
    ],
  })
  const code = result.outputFiles[0].text + `\n// ${engine}:${transformed}`
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

function canvas() {
  return {
    font: '',
    fontKerning: 'auto',
    letterSpacing: '0px',
    measureText(text) {
      let width = [...text].reduce((n, c) => n + ((c.codePointAt(0) % 11) + 4), 0)
      if (this.fontKerning !== 'none' && text.length > 1)
        width -= 0.5 * [...text].filter((c) => c === '\u2028').length
      return { width }
    },
  }
}

function measured(module, text, whiteSpace, spacing, overflow, partial, rich, trace = []) {
  module.clearMeasurementCaches()
  const observe = (object, label) =>
    new Proxy(object, {
      get(target, key) {
        trace.push(`get ${label}.${String(key)}`)
        return Reflect.get(target, key)
      },
      set(target, key, value) {
        trace.push(`set ${label}.${String(key)}=${String(value)}`)
        return Reflect.set(target, key, value)
      },
    })
  const profile = observe(module.getEngineProfile(), 'profile')
  const analysis = observe(module.analyzeText(text, profile, whiteSpace), 'analysis')
  const from = partial && analysis.flags.length > 2 ? 1 : 0
  const to =
    partial && analysis.flags.length > 2 ? analysis.flags.length - 1 : analysis.flags.length
  const paragraph = rich
    ? observe(
        {
          widths: observe([3], 'widths'),
          segmentFlags: observe(new Uint8Array(analysis.flags.length + 1), 'flags'),
          breakableFitAdvances: observe([null], 'advances'),
        },
        'paragraph',
      )
    : null
  return module.measureAnalysis(
    analysis,
    from,
    to,
    '16px Arial',
    true,
    spacing,
    profile,
    null,
    overflow,
    paragraph,
  )
}

function comparePreparations(original, candidate) {
  const seeds = [
    'Hello world',
    'a\tb\nc',
    'اَلْعَرَبِيَّة اختبار',
    '日本語　カタカナ',
    'a\u00adb\u200bc',
    'x🙂y',
    'A (Б) C',
    '\u2028 x',
    'one  two',
    '１２３,５６',
    'कर्म भाषा',
    '\u00a0a\u00a0',
  ]
  let cases = 0
  for (const seed of seeds)
    for (let n = 0; n < 5; n++)
      for (const whiteSpace of ['normal', 'pre-wrap'])
        for (const spacing of [0, 0.5, 1.25])
          for (const overflow of [false, true])
            for (const partial of [false, true])
              for (const rich of [false, true]) {
                const before = [],
                  after = []
                const args = [
                  (seed + ' ').repeat(n + 1),
                  whiteSpace,
                  spacing,
                  overflow,
                  partial,
                  rich,
                ]
                const expected = measured(original, ...args, before)
                const actual = measured(candidate, ...args, after)
                assert.deepEqual(after, before)
                assert.deepEqual(actual, expected)
                cases++
              }
  return cases
}

const rejected = rejectChanges()
globalThis.OffscreenCanvas = class {
  getContext() {
    return canvas()
  }
}
for (const [engine, userAgent] of [
  ['blink', 'AppleWebKit/537.36 Chrome/154.0.0.0'],
  ['webkit', 'AppleWebKit/605.1.15'],
  ['gecko', 'Firefox/156.0'],
]) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent, platform: 'MacIntel' },
    configurable: true,
  })
  const original = await preparationModule(false, engine)
  const candidate = await preparationModule(true, engine)
  const pinned = await preparationModule('pinned', engine)
  assert.equal(comparePreparations(pinned, original), 2880)
  console.log(
    `${engine}: ${comparePreparations(original, candidate)} preparation outputs and traces match`,
  )
}
console.log(
  `Preparation inliner covers ${tracked.length}/${names.length} Git inputs, uses the helper edit and rejects ${rejected} defects.`,
)
