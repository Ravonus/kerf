import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { standaloneMarkup } from './boundaries.mjs'

await test('markup stays inside its standalone runtime graph', () => {
  const root = mkdtempSync(join(tmpdir(), 'kerf-markup-boundary-'))
  const core = join(root, 'packages/core')
  const source = join(core, 'src')
  const manifest = (value) =>
    writeFileSync(
      join(core, 'package.json'),
      JSON.stringify({
        exports: { './markup': value },
      }),
    )
  try {
    mkdirSync(source, { recursive: true })
    writeFileSync(join(source, 'markup.mjs'), 'export const markup = (text) => text\n')
    manifest({ types: './src/markup-shared.d.mts', default: './src/markup-shared.mjs' })
    const shared = join(source, 'markup-shared.mjs')
    writeFileSync(shared, "export { markup } from './markup.mjs'\n")
    assert.equal(standaloneMarkup(root), true)
    for (const dependency of ['node:fs', 'react', '@kerf-js/core', './other.mjs']) {
      writeFileSync(shared, `import '${dependency}'\n`)
      assert.equal(standaloneMarkup(root), false, dependency)
    }
    writeFileSync(shared, "export const load = () => import('@kerf-js/core')\n")
    assert.equal(standaloneMarkup(root), false)
    writeFileSync(shared, "export { markup } from './markup.mjs'\n")
    manifest({ default: './src/markup-shared.mjs', browser: './src/index.ts' })
    assert.equal(standaloneMarkup(root), false)
    manifest('./src/index.ts')
    assert.equal(standaloneMarkup(root), false)
    manifest('./src/markup.mjs')
    assert.equal(standaloneMarkup(root), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
