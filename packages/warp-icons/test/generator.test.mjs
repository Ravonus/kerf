// @vitest-environment node
// Generated modules must remain complete and checked against their artwork.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { outputs } from '../scripts/build.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const repo = resolve(root, '../..')

function check(dir) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [join(dir, 'scripts/build.mjs'), '--check'], {
    cwd: dir,
    env,
    encoding: 'utf8',
  })
}

test('icon declarations match the independent pre-split artwork reference', async () => {
  const files = await outputs()
  const declarations = Object.entries(files)
    .filter(([name]) => /^all-.*\.tsx$/.test(name))
    .flatMap(([, text]) =>
      text.split('\n').filter((line) => /^export (const |\{ (?!iconSet))/.test(line)),
    )
  const digest = (lines) => createHash('sha256').update(lines.join('\n')).digest('hex')
  const reference = 'fd020d848726f48a096da1c89c6f8cad738beb31dc953beb636cf70e0a83dde8'
  expect(declarations.filter((line) => /^export const .*?Icon =/.test(line))).toHaveLength(651)
  expect(declarations).toHaveLength(1958)
  expect(digest(declarations)).toBe(reference)
  expect(digest([...declarations, 'changed'])).not.toBe(reference)
})

test('generated file inventory agrees with the tracked files', async () => {
  const expected = Object.keys(await outputs()).sort()
  const tracked = execFileSync('git', ['ls-files', 'packages/warp-icons/src/gen'], {
    cwd: repo,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .map((p) => p.slice('packages/warp-icons/src/gen/'.length))
    .sort()
  expect(tracked).toEqual(expected)
  expect([...tracked, 'all-orphan.tsx'].sort()).not.toEqual(expected)
})

test('the generator check rejects every missing and stale icon module', async () => {
  const files = Object.keys(await outputs()).filter((name) => /^all-.*\.tsx$/.test(name))
  expect(files).toHaveLength(7)
  const dir = mkdtempSync(join(tmpdir(), 'weft-icon-check-'))
  try {
    for (const path of ['art', 'scripts', 'src/gen'])
      cpSync(join(root, path), join(dir, path), { recursive: true })
    expect(check(dir).status).toBe(0)
    for (const file of files) {
      const path = join(dir, 'src/gen', file)
      const original = readFileSync(path)
      rmSync(path)
      const missing = check(dir)
      expect(missing.status).toBe(1)
      expect(missing.stderr).toContain(file)
      writeFileSync(path, Buffer.concat([original, Buffer.from('\n')]))
      const stale = check(dir)
      expect(stale.status).toBe(1)
      expect(stale.stderr).toContain(file)
      writeFileSync(path, original)
    }
    expect(check(dir).status).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 60000)
