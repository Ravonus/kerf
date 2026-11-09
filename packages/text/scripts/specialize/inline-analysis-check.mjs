// Compare inlined paragraph analysis and its getters with both authored and pinned source.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { inlineAnalysis, inlineAnalysisSegments } from './inline-analysis.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const vendor = path.join(root, 'vendor/pretext/src')
const input = path.join(vendor, 'analysis.ts')
const segmentInput = path.join(vendor, 'analysis-segments.ts')
const tracked = execFileSync('git', ['ls-files', '--', input, segmentInput], { encoding: 'utf8' })
  .trim()
  .split('\n')
assert.equal(tracked.length, 2)
assert.deepEqual(tracked.map((file) => path.basename(file)).sort(), [
  'analysis-segments.ts',
  'analysis.ts',
])
const source = fs.readFileSync(input, 'utf8')
const generated = inlineAnalysis(source)
assert.doesNotMatch(generated, /\btrimGeckoSource\b|\bclearAtomicBreaks\b/)
const anchor = 'sourceBreaks[after] = sourceBreaks[after]! & ~SOFT_HYPHEN_BREAK'
assert.ok(source.includes(anchor))
const edited = inlineAnalysis(source.replace(anchor, `${anchor} | 1`))
assert.ok(edited.includes(`${anchor} | 1`))
assert.notEqual(edited, generated)
const defects = [
  ['return [source, normalized]', 'return [normalized, source]'],
  ['return [source, normalized]', 'return [source, normalized]\n return [source, normalized]'],
  ['const trimGeckoSource =', 'const missingTrim ='],
  ['const clearAtomicBreaks =', 'export const clearAtomicBreaks ='],
  ['sourceBreaks, gecko.leftOut, preserve', 'sourceBreaks, null, preserve'],
  ['sourceBreaks, paragraph, scanStarts)', 'sourceBreaks, paragraph, [])'],
  ['const trailing =', 'const read = () => source\n const trailing ='],
  ['const trailing =', 'void arguments\n const trailing ='],
  ['const trailing =', 'profile = null\n const trailing ='],
  ['const trailing =', 'const leftOut = null\n const trailing ='],
]
for (const [before, after] of defects) {
  assert.ok(source.includes(before))
  assert.throws(() => inlineAnalysis(source.replace(before, after)))
}
const segments = fs.readFileSync(segmentInput, 'utf8')
assert.doesNotMatch(inlineAnalysisSegments(segments), /\bflagUnbroken\b/)
assert.ok(
  inlineAnalysisSegments(
    segments.replace('let hasUnbroken = false', 'let hasUnbroken = true'),
  ).includes('let hasUnbroken = true'),
)
const segmentDefects = [
  ['return hasUnbroken', 'return false'],
  ['const flagUnbroken =', 'const missingFlag ='],
  [
    'flagUnbroken(flags, starts, breaks, hangTabs, count)',
    'flagUnbroken(flags, starts, breaks, false, count)',
  ],
  ['let hasUnbroken = false', 'void this\n let hasUnbroken = false'],
  ['let hasUnbroken = false', 'void normalized\n let hasUnbroken = false'],
]
for (const [before, after] of segmentDefects) {
  assert.ok(segments.includes(before))
  assert.throws(() => inlineAnalysisSegments(segments.replace(before, after)))
}

async function analysisModule(kind, engine) {
  const result = await esbuild.build({
    stdin: {
      contents: `export { analyzeText } from './analysis.js'
export { getEngineProfile } from './measurement.js'`,
      resolveDir: kind === 'pin' ? path.join(root, 'node_modules/@chenglou/pretext/src') : vendor,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'derived-analysis',
        setup(build) {
          if (kind !== 'derived') return
          build.onLoad({ filter: /\/analysis-segments\.ts$/ }, () => ({
            contents: inlineAnalysisSegments(segments),
            loader: 'ts',
          }))
          build.onLoad({ filter: /\/analysis\.ts$/ }, () => ({
            contents: process.argv.includes('--probe')
              ? generated.replace(
                  'const leftOut = gecko.leftOut',
                  'const leftOut = gecko.leftOut; normalized += "!"',
                )
              : generated,
            loader: 'ts',
          }))
        },
      },
    ],
  })
  const code = result.outputFiles[0].text + `\n// ${kind}:${engine}`
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

function analyze({ module, text, whiteSpace, wordBreak, model, own }) {
  const trace = []
  const observe = (target, label) =>
    new Proxy(target, {
      get(object, key) {
        trace.push(`${label}.${String(key)}`)
        return Reflect.get(object, key)
      },
    })
  const pieces = model === 2 ? [text, '\uFFFC', '\u00adب b'] : [text, ' \u00ad', '\u0085中\n本']
  const starts = []
  let joined = ''
  for (const piece of pieces) {
    starts.push(joined.length)
    joined += piece
  }
  const paragraph =
    model === 0
      ? null
      : observe(
          {
            items: pieces.map((piece) => ({ text: piece })),
            starts,
            atomic: [false, model === 2, false],
            ownSegmentBreaks: own,
            sourceOffsets: null,
          },
          'paragraph',
        )
  const profile = observe(module.getEngineProfile(), 'profile')
  let result
  try {
    result = module.analyzeText(
      model === 0 ? text : joined,
      profile,
      whiteSpace,
      wordBreak,
      null,
      paragraph,
    )
  } catch (error) {
    result = { error: error.name + ':' + error.message }
  }
  return { trace, result }
}

function compare(modules) {
  let cases = 0
  const texts = [
    'a b',
    'a\t\nb',
    '  a\r b ',
    'a\u00ad \n b',
    '\u2066 a \u2069 ',
    '日\n本',
    'ب ا',
    '👩‍💻',
    '',
    '\u00ad\n ',
    '\u2028\u2029',
    '\u0085a',
  ]
  for (const text of texts)
    for (const whiteSpace of ['normal', 'pre-wrap'])
      for (const wordBreak of ['normal', 'keep-all'])
        for (const model of [0, 1, 2])
          for (const own of [false, true]) {
            const outputs = modules.map((module) =>
              analyze({ module, text, whiteSpace, wordBreak, model, own }),
            )
            assert.equal(Object.hasOwn(outputs[0].result, 'error'), false)
            assert.deepEqual(outputs[1], outputs[0])
            assert.deepEqual(outputs[2], outputs[0])
            cases++
          }
  return cases
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
  const modules = []
  for (const kind of ['pin', 'source', 'derived']) modules.push(await analysisModule(kind, engine))
  console.log(`${engine}: ${compare(modules)} analysis outputs and getter traces match`)
}
console.log(
  `Analysis inliner covers 2/2 Git inputs, uses the helper edits and rejects ${defects.length + segmentDefects.length} defects.`,
)
