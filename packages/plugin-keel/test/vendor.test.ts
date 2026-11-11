// vendor/ is generated: these hold it to its lock, and (with the KEEL checkouts at hand) to a fresh regeneration.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generate, MODULES, PINS, SOURCE_MODULES } from '../scripts/vendor.mjs'

const pkg = resolve(fileURLToPath(new URL('..', import.meta.url)))
const vendor = join(pkg, 'vendor')
const lock = JSON.parse(readFileSync(join(vendor, 'lock.json'), 'utf8')) as {
  pins: typeof PINS
  files: Record<string, string>
}
const engine = process.env.KEEL_ENGINE ?? join(homedir(), 'dev/keel-engine')
const modules = process.env.KEEL_MODULES ?? join(homedir(), 'dev/keel-modules')
const has = (repo: string, commit: string) => {
  try {
    execFileSync('git', ['-C', repo, 'cat-file', '-e', `${commit}^{commit}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

it('every vendored file matches the lock, and nothing else is there', () => {
  const tracked = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'vendor'],
    { cwd: pkg, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .map((name) => name.replace(/^vendor\//, ''))
    .filter((name) => name !== 'lock.json')
    .sort()
  expect(tracked).toEqual(Object.keys(lock.files).sort())
  for (const [name, digest] of Object.entries(lock.files))
    expect(
      createHash('sha256')
        .update(readFileSync(join(vendor, name)))
        .digest('hex'),
      name,
    ).toBe(digest)
  expect(lock.pins).toEqual(PINS)
})

it('ships each module with its licence beside it', () => {
  for (const id of [...MODULES, ...Object.keys(SOURCE_MODULES)])
    expect(existsSync(join(vendor, `modules/${id}.mjs`)), id).toBe(true)
  expect(readFileSync(join(vendor, 'NOTICE'), 'utf8')).toContain('Three.js')
  expect(readFileSync(join(vendor, 'LICENSE'), 'utf8')).toContain('MIT License')
})

// Regenerating needs both pinned Git objects, so it runs only where the KEEL checkouts hold them.
const pinned =
  has(engine, PINS.engine) &&
  has(modules, PINS.modules) &&
  Object.values(SOURCE_MODULES).every((source) => has(modules, source.commit))
// Skipped where the pinned KEEL commits are absent: a fresh clone or CI has only this repo.
describe.skipIf(!pinned)('pinned vendor generation', () => {
  it('recreates every file byte for byte', { timeout: 120_000 }, async () => {
    const made = await generate(engine, modules)
    for (const [name, data] of made)
      expect(Buffer.from(data).equals(readFileSync(join(vendor, name))), name).toBe(true)
    expect(made.size).toBe(Object.keys(lock.files).length + 1)
  })
})
