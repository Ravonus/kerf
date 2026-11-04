import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import test from 'node:test'
import weft from '../../packages/core/vite.mjs'
import { BROWSER, entry } from './boundaries.mjs'

await test('browser entries name tracked package folders', (t) => {
  const manifests = execFileSync('git', ['ls-files', ':(glob)packages/*/package.json'], {
    encoding: 'utf8',
  }).trim().split('\n')
  const folders = new Set(manifests.map(dirname))
  let entries = 0
  for (const [folder, exports] of Object.entries(BROWSER)) {
    assert.ok(folders.has(`packages/${folder}`), `untracked browser package: ${folder}`)
    for (const name of exports) {
      const file = entry(folder, name)
      assert.ok(file && existsSync(file), `missing browser entry: ${folder}${name}`)
      entries++
    }
  }
  t.diagnostic(`${entries} browser entries in ${Object.keys(BROWSER).length}/${manifests.length} tracked packages`)
})

await test('Vite keeps core internals outside app transforms after the folder move', () => {
  const plugins = weft({ off: ['REUSE'] })
  for (const name of ['weft:keyed', 'weft:features', 'weft:interaction']) {
    const plugin = plugins.find((item) => item.name === name)
    const exclude = plugin.transform.filter.id.exclude
    for (const path of ['/repo/packages/core/src/index.ts', 'C:\\repo\\packages\\core\\src\\index.ts'])
      assert.ok(exclude.test(path), `${name} rewrites core internals: ${path}`)
    assert.equal(exclude.test('/repo/app/src/index.ts'), false)
  }
  const flags = plugins.find((item) => item.name === 'weft:flags').transform
  for (const path of ['/repo/packages/core/src/flags.ts', 'C:\\repo\\packages\\core\\src\\flags.ts'])
    assert.ok(flags.filter.id.test(path), `speed flags miss the moved source: ${path}`)
  assert.match(flags.handler('export const REUSE = true').code, /REUSE = false/)
})
