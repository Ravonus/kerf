import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const verifier = fileURLToPath(new URL('../evidence/T06/verify-packages.mjs', import.meta.url))

test('installed packages must match every packed byte', () => {
  const root = mkdtempSync(join(tmpdir(), 'kerf-provenance-test-'))
  try {
    const app = join(root, 'app'),
      scratch = join(root, 'scratch'),
      mapping = {}
    const names = [
      'core',
      'start',
      'cli',
      'veneer',
      'veneer-core',
      'veneer-icons',
      'compiler-darwin-arm64',
    ]
    for (const name of names) {
      const source = join(root, `source-${name}`, 'package')
      const installed = join(app, 'node_modules', '@kerf', name)
      mkdirSync(source, { recursive: true })
      mkdirSync(installed, { recursive: true })
      writeFileSync(join(source, 'package.json'), JSON.stringify({ name: `@kerf/${name}` }))
      writeFileSync(join(installed, 'package.json'), JSON.stringify({ name: `@kerf/${name}` }))
      writeFileSync(join(source, 'data.txt'), `candidate ${name}`)
      writeFileSync(join(installed, 'data.txt'), `candidate ${name}`)
      const tar = join(root, `${name}.tgz`)
      execFileSync('/usr/bin/tar', ['-czf', tar, '-C', join(root, `source-${name}`), 'package'])
      mapping[`@kerf/${name}`] = `file:${tar}`
    }
    const mapFile = join(root, 'tarballs.json')
    writeFileSync(mapFile, JSON.stringify(mapping))
    const run = () =>
      spawnSync(process.execPath, [verifier, app, scratch, mapFile], { encoding: 'utf8' })
    const good = run()
    assert.equal(good.status, 0, good.stderr)
    assert.equal(JSON.parse(good.stdout).length, 7)
    writeFileSync(join(app, 'node_modules/@kerf/core/data.txt'), 'published mismatch')
    const bad = run()
    assert.notEqual(bad.status, 0)
    assert.match(bad.stderr, /installed file differs from @kerf\/core/)
    writeFileSync(join(app, 'node_modules/@kerf/core/data.txt'), 'candidate core')
    const extra = join(app, 'node_modules/@kerf/foreign')
    mkdirSync(extra)
    writeFileSync(join(extra, 'package.json'), JSON.stringify({ name: '@kerf/foreign' }))
    const foreign = run()
    assert.notEqual(foreign.status, 0)
    assert.match(foreign.stderr, /missing local tarball @kerf\/foreign/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
