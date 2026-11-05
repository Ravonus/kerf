import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generate, writeGenerated } from '../scripts/vendor.mjs'
import { checkHash, splitMoved } from '../scripts/vendor/bundle.mjs'
import { verify } from '../scripts/vendor/verify.mjs'

const pkg = resolve(fileURLToPath(new URL('..', import.meta.url)))
const vendor = join(pkg, 'vendor')
const repo = process.env.KEEL_ENGINE ?? join(homedir(), 'dev/keel-engine')

it('rejects bad bundle input and incomplete module coverage', () => {
  expect(() => checkHash('bad source', '0'.repeat(64), 'source')).toThrow('source: expected')
  expect(() => splitMoved('render', 'bad source', [])).toThrow('render moved bundle')
})

// The external pinned Git object is needed to regenerate the vendor files.
describe.skipIf(!existsSync(join(repo, '.git')))('pinned vendor generation', () => {
  it('recreates every tracked file and rejects missing, changed and stale helpers', async () => {
    const first = await generate(repo)
    const second = await generate(repo)
    expect(first).toEqual(second)
    expect(first.size).toBe(19)
    const tracked = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'vendor'],
      {
        cwd: pkg,
        encoding: 'utf8',
      },
    )
      .trim()
      .split('\n')
      .map((name) => name.replace(/^vendor\//, ''))
      .sort()
    expect([...first.keys()].sort()).toEqual(tracked)
    verify(first, vendor)
    const dir = mkdtempSync(join(tmpdir(), 'weft-keel-test-'))
    try {
      writeFileSync(join(dir, 'LICENSE'), first.get('LICENSE')!)
      writeGenerated(first, dir)
      verify(second, dir)
      const helper = join(dir, 'keel-render', 'renderer-api.mjs')
      rmSync(helper)
      expect(() => verify(first, dir)).toThrow('Missing generated file')
      writeFileSync(helper, 'changed')
      expect(() => verify(first, dir)).toThrow('Changed generated file')
      writeGenerated(first, dir)
      writeFileSync(join(dir, 'keel-render', 'stale.mjs'), '')
      expect(() => verify(first, dir)).toThrow('Stale generated file')
      expect(() => writeGenerated(first, dir)).toThrow('Stale generated file')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a source directory without the pinned Git object', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weft-keel-bad-source-'))
    try {
      await expect(generate(dir)).rejects.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
