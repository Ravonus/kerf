// Check that installing full engine data clears caches populated from the base tables.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { specialize } from '../specialize.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dir = path.join(root, 'gen/gecko')
const entry = `
import { mayHoldCursive } from './prepare-script.ts'
import { isEastAsianSegmentBreak } from './gecko-line-breaks-transform.ts'
import { getGeckoLineBreaks } from './gecko-line-breaks.ts'
export { mayHoldCursive, isEastAsianSegmentBreak, getGeckoLineBreaks }
export async function load() { await import('./pack-scripts.ts') }
`

async function engine(drop, tag = drop) {
  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: dir, loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    plugins: [
      {
        name: 'remove-reset-for-test',
        setup(build) {
          build.onLoad({ filter: /pack-scripts\.ts$/ }, (args) => {
            let contents = fs.readFileSync(args.path, 'utf8')
            if (drop) {
              const call = `${drop}()`
              assert.equal(contents.split(call).length, 2, `reset call missing: ${drop}`)
              contents = contents.replace(call, 'void 0')
            }
            return { contents, loader: 'ts' }
          })
        },
      },
    ],
  })
  const code = result.outputFiles[0].text + `\n// ${tag}`
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

function warm(module) {
  module.mayHoldCursive('é')
  module.isEastAsianSegmentBreak('a\nb', 1, 2, false)
  module.getGeckoLineBreaks('alpha beta', false, false, 'gecko/char')
}

function snapshot(module) {
  return {
    cursive: module.mayHoldCursive('العربية'),
    asian: module.isEastAsianSegmentBreak('日\n本', 1, 2, false),
    breaks: [
      ...module.getGeckoLineBreaks('日本語中文 العربية 👩‍💻', false, false, 'gecko/char').breaks,
    ],
  }
}

try {
  await specialize('gecko', { useCoverage: false })
  const fresh = await engine('', 'fresh')
  await fresh.load()
  const expected = snapshot(fresh)
  assert.equal(expected.cursive, true)
  assert.equal(expected.asian, true)
  const transitioned = await engine('', 'transitioned')
  warm(transitioned)
  await transitioned.load()
  assert.deepEqual(snapshot(transitioned), expected)
  for (const name of [
    'r_prepare_script_ts',
    'r_gecko_line_breaks_transform_ts',
    'r_gecko_line_breaks_ts',
  ]) {
    const broken = await engine(name)
    warm(broken)
    await broken.load()
    assert.notDeepEqual(snapshot(broken), expected, `reset defect was not detected: ${name}`)
  }
  console.log('Full-data installation preserves output and detects three missing cache resets.')
} finally {
  await specialize('gecko')
}
